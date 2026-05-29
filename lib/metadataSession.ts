import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runConsultarDatosForSkill } from "@/lib/consultarDatos";
import { SKILL_GATE_COMERCIAL } from "@/lib/biSkillTools";

/** SELECT exacto que calienta metadatos al inicio del chat desde META en banda. */
export const V_METADATA_SISTEMA_QUERY = [
  "SELECT",
  "  'META_VENTA_NETA' AS MODULO,",
  "  MIN(ANIO) AS ANIO_MINIMO,",
  "  MAX(ANIO) AS ANIO_MAXIMO,",
  "  MIN(FECHA) AS FECHA_DESDE,",
  "  MAX(FECHA) AS FECHA_HASTA,",
  "  COUNT(*) AS TOTAL_REGISTROS,",
  "  COUNT(DISTINCT CAST(PERIODO AS VARCHAR(6))) AS TOTAL_PERIODOS,",
  "  COUNT(DISTINCT LOCAL) AS TOTAL_LOCALES,",
  "  COUNT(DISTINCT RUC) AS TOTAL_CLIENTES,",
  "  MAX(CAST(PERIODO AS VARCHAR(6))) AS PERIODO_MAXIMO",
  "FROM dbo.meta_venta_neta WITH (NOLOCK)",
].join("\n");

export type SistemaMetadataRow = {
  MODULO: string;
  ANIO_MINIMO: number | null;
  ANIO_MAXIMO: number | null;
  FECHA_DESDE: string | null;
  FECHA_HASTA: string | null;
  TOTAL_REGISTROS: number | null;
  TOTAL_PERIODOS: number | null;
  TOTAL_LOCALES: number | null;
  TOTAL_CLIENTES: number | null;
  PERIODO_MAXIMO: string | null;
};

type Cached = {
  at: number;
  rows: SistemaMetadataRow[];
  totalRegistros: number;
  metadataLoadFailed?: boolean;
};

function metadataSessionTtlMs(): number {
  const raw = process.env.METADATA_SESSION_TTL_MS?.trim();
  const v = raw ? parseInt(raw, 10) : NaN;
  const n = Number.isFinite(v) ? v : 5 * 60 * 1000;
  return Math.min(30 * 60 * 1000, Math.max(60_000, n));
}

const sessionCache = new Map<string, Cached>();

function toNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

export function parseMetadataToolPayload(json: string): SistemaMetadataRow[] {
  const parsed = JSON.parse(json) as {
    rows?: Record<string, unknown>[];
  };
  const rows = parsed.rows ?? [];
  return rows.map((r) => ({
    MODULO: String(r.MODULO ?? "").trim(),
    ANIO_MINIMO: toNumber(r.ANIO_MINIMO),
    ANIO_MAXIMO: toNumber(r.ANIO_MAXIMO),
    FECHA_DESDE: toStringOrNull(r.FECHA_DESDE),
    FECHA_HASTA: toStringOrNull(r.FECHA_HASTA),
    TOTAL_REGISTROS: toNumber(r.TOTAL_REGISTROS),
    TOTAL_PERIODOS: toNumber(r.TOTAL_PERIODOS),
    TOTAL_LOCALES: toNumber(r.TOTAL_LOCALES),
    TOTAL_CLIENTES: toNumber(r.TOTAL_CLIENTES),
    PERIODO_MAXIMO: toStringOrNull(r.PERIODO_MAXIMO),
  }));
}

export function computeTotalRegistros(rows: SistemaMetadataRow[]): number {
  return rows.reduce((acc, r) => acc + (r.TOTAL_REGISTROS ?? 0), 0);
}

export function getGlobalFechaRange(rows: SistemaMetadataRow[]): {
  desde: Date | null;
  hasta: Date | null;
} {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const r of rows) {
    const d = r.FECHA_DESDE ? new Date(r.FECHA_DESDE) : null;
    const h = r.FECHA_HASTA ? new Date(r.FECHA_HASTA) : null;
    if (d && !Number.isNaN(d.getTime())) {
      if (!min || d < min) min = d;
    }
    if (h && !Number.isNaN(h.getTime())) {
      if (!max || h > max) max = h;
    }
  }
  return { desde: min, hasta: max };
}

export function extractRequestedDateRange(
  messages: ChatCompletionMessageParam[]
): { desde: Date; hasta: Date } | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (typeof lastUser?.content === "string" ? lastUser.content : "")
    .toLowerCase()
    .trim();
  if (!text) return null;

  // Hoy / día actual (calendario)
  if (/\b(hoy|del\s+d[ií]a|d[ií]a\s+actual)\b/.test(text)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { desde: d, hasta: new Date(d) };
  }

  // Mes actual / este mes (calendario)
  if (
    /\b(mes\s+actual|este\s+mes|del\s+mes|mes\s+en\s+curso)\b/.test(text) ||
    (/\bactual\b/.test(text) &&
      /\b(ventas|mes|totales|clientes\s+nuevos)\b/.test(text))
  ) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    return { desde: new Date(y, mo, 1), hasta: new Date(y, mo + 1, 0) };
  }

  // yyyy-mm-dd
  const dateMatches = Array.from(
    text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)
  );
  if (dateMatches.length) {
    const dates = dateMatches
      .map((m) => new Date(`${m[1]}-${m[2]}-${m[3]}`))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return { desde: min, hasta: max };
  }

  // periodo YYYYMM
  const per = text.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (per) {
    const y = Number(per[1]);
    const m = Number(per[2]);
    const desde = new Date(y, m - 1, 1);
    const hasta = new Date(y, m, 0);
    return { desde, hasta };
  }

  // "2026" o "año 2026"
  const year = text.match(/\b(20\d{2})\b/);
  if (year) {
    const y = Number(year[1]);
    const desde = new Date(y, 0, 1);
    const hasta = new Date(y, 11, 31);
    return { desde, hasta };
  }

  return null;
}

/** Años mencionados en el mensaje del usuario (ej. 2024 y 2025). */
export function extractRequestedYears(text: string): number[] {
  const matches = text.match(/\b(20\d{2})\b/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((y) => Number(y)))).sort(
    (a, b) => a - b
  );
}

/** Años pedidos que quedan fuera de ANIO_MIN/MAX en META. */
export function yearsOutsideMetadataCoverage(
  rows: SistemaMetadataRow[],
  years: number[]
): number[] {
  if (!years.length) return [];
  const row = rows.find((r) => r.MODULO?.toUpperCase().includes("META"));
  const min = row?.ANIO_MINIMO;
  const max = row?.ANIO_MAXIMO;
  if (min == null || max == null) return [];
  return years.filter((y) => y < min || y > max);
}

export function formatPartialYearCoverageNote(
  rows: SistemaMetadataRow[],
  outsideYears: number[]
): string {
  const row = rows.find((r) => r.MODULO?.toUpperCase().includes("META"));
  const min = row?.ANIO_MINIMO ?? "—";
  const max = row?.ANIO_MAXIMO ?? "—";
  const list = outsideYears.join(", ");
  return `\n[COBERTURA] El usuario pidió año(s) ${list}; en meta_venta_neta solo hay datos entre ${min} y ${max}. Ejecuta SQL con esos años (devolverá 0 donde no haya filas), reporta totales y variación %, incluye chart, y explica qué años sí tienen información.\n`;
}

export async function getOrFetchMetadata(sessionId: string): Promise<{
  rows: SistemaMetadataRow[];
  refreshed: boolean;
  totalRegistros: number;
  previousTotalRegistros: number | null;
  /** True si falló la lectura de V_METADATA_SISTEMA (error SQL); el agente debe usar router híbrido / banda. */
  metadataLoadFailed?: boolean;
}> {
  const now = Date.now();
  const cached = sessionCache.get(sessionId);
  const ttl = metadataSessionTtlMs();
  if (cached && now - cached.at <= ttl) {
    return {
      rows: cached.rows,
      refreshed: false,
      totalRegistros: cached.totalRegistros,
      previousTotalRegistros: null,
      metadataLoadFailed: cached.metadataLoadFailed,
    };
  }

  const previousTotal = cached?.totalRegistros ?? null;

  let rows: SistemaMetadataRow[];
  let totalRegistros: number;
  let metadataLoadFailed = false;

  try {
    const toolJson = await runConsultarDatosForSkill(
      V_METADATA_SISTEMA_QUERY,
      SKILL_GATE_COMERCIAL
    );
    rows = parseMetadataToolPayload(toolJson);
    totalRegistros = computeTotalRegistros(rows);
  } catch {
    rows = [];
    totalRegistros = 0;
    metadataLoadFailed = true;
  }

  sessionCache.set(sessionId, {
    at: now,
    rows,
    totalRegistros,
    metadataLoadFailed,
  });

  return {
    rows,
    refreshed: true,
    totalRegistros,
    previousTotalRegistros: previousTotal,
    metadataLoadFailed,
  };
}

function calendarYyyyMm(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function formatHoyEs(d = new Date()): string {
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function periodoMaximo(rows: SistemaMetadataRow[]): string | null {
  return rows.find((r) => r.PERIODO_MAXIMO)?.PERIODO_MAXIMO ?? null;
}

/** Mes calendario (YYYYMM) posterior al último PERIODO cargado en META. */
export function mesCalendarioSinDatosEnMeta(
  rows: SistemaMetadataRow[]
): boolean {
  const max = periodoMaximo(rows);
  if (!max) return false;
  return calendarYyyyMm() > max;
}

export function userAsksMesActualOrHoy(
  text: string
): "mes" | "dia" | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (/\b(hoy|del\s+d[ií]a|d[ií]a\s+actual)\b/.test(t)) return "dia";
  if (
    /\b(mes\s+actual|este\s+mes|del\s+mes|mes\s+en\s+curso)\b/.test(t) ||
    (/\bactual\b/.test(t) &&
      /\b(ventas|mes|totales|clientes\s+nuevos)\b/.test(t))
  ) {
    return "mes";
  }
  return null;
}

/** Mensaje claro cuando no hay datos para el período pedido (sin nombres técnicos de BD). */
export function formatSinDatosPeriodoMessage(
  rows: SistemaMetadataRow[],
  kind: "mes_calendario" | "dia_calendario" | "periodo_explicito"
): string {
  const { hasta } = getGlobalFechaRange(rows);
  const max = periodoMaximo(rows);
  const hastaEs = hasta ? formatHoyEs(hasta) : "fecha no disponible";
  const hoy = formatHoyEs();
  const mesNombre = hoy.replace(/^\d+\s+de\s+/, "");
  const ultimoMesEs = max
    ? formatHoyEs(new Date(Number(max.slice(0, 4)), Number(max.slice(4, 6)) - 1, 1)).replace(
        /^\d+\s+de\s+/,
        ""
      )
    : hastaEs.replace(/^\d+\s+de\s+/, "");

  if (kind === "mes_calendario") {
    return `No tengo información de ventas para el **mes actual** (${mesNombre}). Los datos disponibles llegan hasta **${hastaEs}** (último mes con información: **${ultimoMesEs}**). No puedo darte cifras de ese mes hasta que se actualice la información. Puedes consultar un mes dentro del rango (por ejemplo **${ultimoMesEs}**) o preguntar por las **ventas de hoy**.`;
  }
  if (kind === "dia_calendario") {
    return `No hay información histórica de ventas para **hoy** (${hoy}). Los datos cargados llegan hasta **${hastaEs}**. Si necesitas las ventas del día en curso, puedo consultarlas en tiempo real; para meses cerrados, indica un mes hasta **${ultimoMesEs}**.`;
  }
  return `El período que indicas no está dentro de la información disponible. Solo tengo datos de ventas hasta **${hastaEs}**${max ? ` (último mes: **${ultimoMesEs}**)` : ""}. Indica un mes o año dentro de ese rango.`;
}

export function formatMetadataForSystemPrompt(
  rows: SistemaMetadataRow[],
  opts?: { loadFailed?: boolean }
): string {
  if (opts?.loadFailed) {
    return `\n\n=== METADATA DEL SISTEMA ===\nNo se pudo leer metadatos desde dbo.meta_venta_neta. No bloquees la respuesta: usa [banda].[dbo] con la skill correcta y para histórico comercial usa dbo.meta_venta_neta.\n=== FIN METADATA ===\n`;
  }
  if (!rows.length) {
    return `\n\n=== METADATA DEL SISTEMA (dbo.meta_venta_neta) ===\nSin filas devueltas. Confirma cobertura con otra consulta en banda.\n=== FIN METADATA ===\n`;
  }
  const { desde, hasta } = getGlobalFechaRange(rows);
  const fmt = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : "Sin dato";
  const header = `\n\n=== METADATA DEL SISTEMA (dbo.meta_venta_neta) ===\nRango global disponible: ${fmt(desde)} a ${fmt(hasta)}\n`;
  const periodoMax = rows.find((r) => r.PERIODO_MAXIMO)?.PERIODO_MAXIMO ?? null;
  const mesCal = calendarYyyyMm();
  const hoyEs = formatHoyEs();
  const periodoRule = `**Calendario hoy:** ${hoyEs} (mes YYYYMM **${mesCal}**).
**Regla «actual»:** Si el usuario dice **actual**, **mes actual**, **este mes**, **del mes** o equivalentes → filtra el **mes calendario en curso** con \`CAST(PERIODO AS VARCHAR(6)) = FORMAT(GETDATE(), 'yyyyMM')\` o \`(YEAR(FECHA)*100+MONTH(FECHA)) = YEAR(GETDATE())*100+MONTH(GETDATE())\`. Si dice **hoy** / **del día** → \`CAST(FECHA AS DATE) = CAST(GETDATE() AS DATE)\` (META) o \`FAC_FACTURAS\` con fecha hoy.
En la respuesta **nombra el mes/año calendario** (ej. «mayo 2026»), no confundas con el último mes cargado en BD.
**PERIODO_MAXIMO**${periodoMax ? ` (**${periodoMax}**)` : ""} = último período **cargado** en META (cobertura de datos). **No** es sinónimo de «mes actual» del calendario.
Si el **mes calendario actual** (**${mesCal}**) es **posterior** a PERIODO_MAXIMO → **no ejecutes SQL** en META ni devuelvas cifras de meses viejos; explica que no hay datos del mes actual y hasta qué fecha/mes sí hay.

`;
  const lines = rows
    .slice(0, 30)
    .map((r) => {
      const mod = r.MODULO || "Sin módulo";
      const a1 = r.ANIO_MINIMO ?? "—";
      const a2 = r.ANIO_MAXIMO ?? "—";
      const fd = r.FECHA_DESDE ?? "—";
      const fh = r.FECHA_HASTA ?? "—";
      const tr = r.TOTAL_REGISTROS ?? 0;
      return `- ${mod}: años ${a1}-${a2}, fechas ${fd} a ${fh}, registros ${tr}`;
    })
    .join("\n");
  return header + periodoRule + "Por módulo:\n" + lines + "\n=== FIN METADATA ===\n";
}

