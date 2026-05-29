import { BANDAVONI_ERP_TABLES } from "@/lib/bandavanoniDbCatalog";
import { isPostgresDb } from "@/lib/dbEnv";

const FORBIDDEN = [
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "DROP ",
  "ALTER ",
  "TRUNCATE ",
  "EXEC ",
  "EXECUTE ",
  "MERGE ",
  "INTO ",
  "CREATE ",
  "GRANT ",
  "REVOKE ",
  "--",
  "/*",
  "OPENROWSET",
  "OPENDATASOURCE",
];

/** Vistas GestionBI (legacy; no existen en bandavanoni_new_2018_resp). */
export const ALLOWED_BI_VIEWS = [
  "V_MAESTRA_VENTAS",
  "V_MAESTRA_INVENTARIO",
  "V_MAESTRA_CARTERA",
  "V_MAESTRA_CUENTAS_PAGAR",
  "V_MAESTRA_CIERRE_CAJA",
  "V_MAESTRA_TESORERIA",
  "V_MAESTRA_BANCOS",
  "V_MAESTRA_CONTABILIDAD",
  "V_MAESTRA_RETENCIONES",
  "V_PLAN_CUENTAS",
  "V_IA_PARAMETROS_NEGOCIO",
  "V_METADATA_SISTEMA",
] as const;

export const GESTION_ANALYTIC_TABLES = ["META_VENTA_NETA"] as const;

export const BANDA_KNOWN_TABLES = BANDAVONI_ERP_TABLES;

const LEGACY_ERP_BLOCK_PATTERN =
  /\b(FAC_|FFG_|FMO_|FCL_|FVE_|TBS_|STK_|LOC_|FCC_|CICA_|FLJ_|DFL_|TES_|META_VENTA_NETA\b)/i;

function envInt(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const v = parseInt(process.env[name] || String(fallback), 10);
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

const MAX_ROWS = envInt("SQL_QUERY_MAX_ROWS", 2000, 100, 5000);

export type SkillGate = {
  /** Vistas legacy (vacío en bandavanoni_new_2018_resp). */
  views: readonly string[];
  /** Tablas analíticas (meta_venta_neta). */
  gestionTables?: readonly string[];
  /** Tablas ERP en dbo.* de la base activa. */
  erpTables?: readonly string[];
  /** @deprecated Usar erpTables con dbo.* */
  bandaTables?: readonly string[];
};

export function normalizeSelectSqlCore(raw: string): {
  trimmed: string;
  upper: string;
} {
  const trimmed = raw.trim().replace(/;+\s*$/g, "");
  const upper = trimmed.toUpperCase().replace(/\s+/g, " ");

  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new Error("Solo se permiten consultas SELECT (o WITH ... SELECT).");
  }

  if (upper.startsWith("WITH") && !upper.includes("SELECT")) {
    throw new Error("Las expresiones WITH deben contener un SELECT final.");
  }

  for (const bad of FORBIDDEN) {
    if (upper.includes(bad)) {
      throw new Error("La consulta contiene operaciones no permitidas.");
    }
  }
  if ((trimmed.match(/;/g) || []).length > 1) {
    throw new Error("No se permiten múltiples sentencias.");
  }

  if (upper.includes("[BANDA]")) {
    throw new Error(
      "Prohibido [banda].[dbo].[...]; usa dbo.Tabla WITH (NOLOCK) en bandavanoni_new_2018_resp."
    );
  }

  return { trimmed, upper };
}

function legacyErpBlockForGenericQuery(trimmed: string): void {
  if (LEGACY_ERP_BLOCK_PATTERN.test(trimmed)) {
    throw new Error(
      "Consulta no permitida en esta ruta; usa las herramientas por skill."
    );
  }
}

export function assertSafeSelect(raw: string): string {
  const { trimmed, upper } = normalizeSelectSqlCore(raw);
  legacyErpBlockForGenericQuery(trimmed);

  const usesAllowed = ALLOWED_BI_VIEWS.some((v) => upper.includes(v));
  if (!usesAllowed) {
    throw new Error(
      `La consulta debe usar al menos una vista permitida: ${ALLOWED_BI_VIEWS.join(", ")}.`
    );
  }

  return trimmed;
}

function tableInSql(upper: string, table: string): boolean {
  return new RegExp(`\\b${table}\\b`, "i").test(upper);
}

function assertFacAnuladoFilter(upper: string, table: string): void {
  if (table !== "FAC_FACTURAS" && table !== "FAC_FACTURA_DETALLE") return;
  const ffgOk =
    /\bFFG_ANULADO\s*[=]\s*['"]?[0N]['"]?\b/i.test(upper) ||
    /\bFFG_ANULADO\s*<>\s*['"]?[1S]['"]?\b/i.test(upper) ||
    /\bFFG_ANULADO\b.*\b[=]\s*['"]N['"]/i.test(upper);
  if (!ffgOk) {
    throw new Error(
      `${table} requiere excluir anuladas: FFG_ANULADO='N' en WHERE o JOIN.`
    );
  }
}

function assertErpRefs(trimmed: string, upper: string, gate: SkillGate): void {
  const allowedErp = new Set(
    [...(gate.erpTables ?? []), ...(gate.bandaTables ?? [])].map((t) =>
      t.toUpperCase()
    )
  );
  if (allowedErp.size === 0) return;

  if (!isPostgresDb() && !upper.includes("WITH (NOLOCK)")) {
    throw new Error(
      "Las tablas ERP requieren WITH (NOLOCK) en cada FROM/JOIN."
    );
  }

  for (const t of Array.from(allowedErp)) {
    if (!tableInSql(upper, t)) continue;
    assertFacAnuladoFilter(upper, t);
  }

  for (const t of BANDAVONI_ERP_TABLES) {
    if (!tableInSql(upper, t)) continue;
    if (!allowedErp.has(t)) {
      throw new Error(`La tabla ${t} no está permitida en esta skill.`);
    }
  }
}

export function assertSafeSelectForBiSkill(
  gate: SkillGate,
  raw: string
): string {
  const { trimmed, upper } = normalizeSelectSqlCore(raw);

  const allowView = new Set(gate.views.map((v) => v.toUpperCase()));
  for (const v of ALLOWED_BI_VIEWS) {
    if (upper.includes(v) && !allowView.has(v)) {
      throw new Error(
        `En esta skill no puedes usar ${v}. En bandavanoni_new_2018_resp no existen V_MAESTRA_*; usa dbo.FAC_* o meta_venta_neta.`
      );
    }
  }

  const allowGestion = new Set(
    (gate.gestionTables ?? []).map((t) => t.toUpperCase())
  );
  for (const t of GESTION_ANALYTIC_TABLES) {
    if (tableInSql(upper, t) && !allowGestion.has(t)) {
      throw new Error(`La tabla ${t} no está permitida en esta skill.`);
    }
  }

  assertErpRefs(trimmed, upper, gate);

  const usesView = gate.views.some((v) => upper.includes(v));
  const usesGestion = (gate.gestionTables ?? []).some((t) =>
    tableInSql(upper, t)
  );
  const usesErp = [...(gate.erpTables ?? []), ...(gate.bandaTables ?? [])].some(
    (t) => tableInSql(upper, t)
  );

  if (!usesView && !usesGestion && !usesErp) {
    throw new Error(
      "La consulta debe usar meta_venta_neta y/o tablas dbo.FAC_* / BCO / TES_* permitidas en esta skill."
    );
  }

  return trimmed;
}

export function limitRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.slice(0, MAX_ROWS);
}

export function getSqlAiMaxRowsForLlm(): number {
  return envInt("SQL_AI_MAX_ROWS", 60, 5, 500);
}

export function limitRowsForLLM<T extends Record<string, unknown>>(
  rows: T[]
): T[] {
  const cap = getSqlAiMaxRowsForLlm();
  return rows.slice(0, cap);
}
