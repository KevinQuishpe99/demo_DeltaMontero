/**
 * Respuestas rápidas y fiables para preguntas frecuentes (playbook Kevin / demo).
 * Evita doble vuelta al LLM cuando el patrón es conocido.
 */
import { SKILL_GATE_COMERCIAL } from "@/lib/biSkillTools";
import { runConsultarDatosForSkill } from "@/lib/consultarDatos";
import { chartColorAt } from "@/lib/chartPalette";

export type PlaybookId =
  | "q1_trimestre_2024_2025"
  | "q2_anual_2024_2025"
  | "q3_top10_productos_2025"
  | "q4_clientes_2024"
  | "q5_trimestres_2024_2025"
  | "q6_productos_crecimiento";

export type PlaybookMatch = {
  id: PlaybookId;
  sql: string;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function rowNum(row: Record<string, unknown>, key: string): number {
  const v = row[key] ?? row[key.toLowerCase()];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowStr(row: Record<string, unknown>, key: string): string {
  const v = row[key] ?? row[key.toLowerCase()];
  return String(v ?? "").trim();
}

function chartBlock(
  chartType: "bar" | "line",
  data: Record<string, unknown>[],
  xKey: string,
  series: { key: string; name: string; color?: string }[]
): string {
  const spec = {
    type: "chart",
    chartType,
    data,
    xKey,
    series,
  };
  return `\n\n\`\`\`json\n${JSON.stringify(spec, null, 2)}\n\`\`\`\n`;
}

export function matchPlaybook(text: string): PlaybookMatch | null {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    /primer trimestre/.test(t) &&
    /2024/.test(t) &&
    /2025/.test(t) &&
    /(grafico|compar|variacion|ventas netas)/.test(t)
  ) {
    return {
      id: "q1_trimestre_2024_2025",
      sql: `SELECT ANIO, SUM(VENTA_NETA) AS VENTA_NETA
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE TRIMESTRE = 1 AND ANIO IN (2024, 2025)
GROUP BY ANIO ORDER BY ANIO`,
    };
  }

  if (
    /total de ventas|ventas en el ano|ventas del ano/.test(t) &&
    /2024/.test(t) &&
    /2025/.test(t) &&
    /(compar|variacion|frente)/.test(t)
  ) {
    return {
      id: "q2_anual_2024_2025",
      sql: `SELECT ANIO, SUM(VENTA_NETA) AS VENTA_NETA, SUM(UTILIDAD) AS UTILIDAD
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO IN (2024, 2025)
GROUP BY ANIO ORDER BY ANIO`,
    };
  }

  if (
    /10 productos/.test(t) &&
    /2025/.test(t) &&
    /(mas vendidos|top)/.test(t)
  ) {
    return {
      id: "q3_top10_productos_2025",
      sql: `SELECT TOP 10 CODIGO, MAX(DESCRIPCION) AS DESCRIPCION,
  SUM(VENTA_NETA) AS VENTA_NETA
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2025
GROUP BY CODIGO
ORDER BY SUM(VENTA_NETA) DESC`,
    };
  }

  if (
    /2024/.test(t) &&
    /clientes/.test(t) &&
    /(ingresos|margen|rentabilidad|directorio)/.test(t)
  ) {
    return {
      id: "q4_clientes_2024",
      sql: `SELECT TOP 10 NOMBRE_COMPLETO, RUC,
  SUM(VENTA_NETA) AS VENTA_NETA,
  SUM(UTILIDAD) AS UTILIDAD
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024 AND RUC IS NOT NULL
GROUP BY NOMBRE_COMPLETO, RUC
ORDER BY SUM(VENTA_NETA) DESC`,
    };
  }

  if (
    /trimestre/.test(t) &&
    /2024/.test(t) &&
    /2025/.test(t) &&
    /(t1|t2|t3|t4|repartieron)/.test(t)
  ) {
    return {
      id: "q5_trimestres_2024_2025",
      sql: `SELECT ANIO, TRIMESTRE, SUM(VENTA_NETA) AS VENTA_NETA
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO IN (2024, 2025)
GROUP BY ANIO, TRIMESTRE
ORDER BY ANIO, TRIMESTRE`,
    };
  }

  if (
    /productos/.test(t) &&
    /2024/.test(t) &&
    /2025/.test(t) &&
    /(crecieron|decrecieron|crecimiento)/.test(t)
  ) {
    return {
      id: "q6_productos_crecimiento",
      sql: `WITH agg AS (
  SELECT CODIGO, MAX(DESCRIPCION) AS DESCRIPCION,
    SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) AS V2024,
    SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) AS V2025
  FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY CODIGO
),
calc AS (
  SELECT CODIGO, DESCRIPCION, V2024, V2025, (V2025 - V2024) AS DELTA_MONTO
  FROM agg WHERE V2024 > 0 OR V2025 > 0
),
ranked_up AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY DELTA_MONTO DESC) AS RN
  FROM calc WHERE DELTA_MONTO > 0
),
ranked_down AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY DELTA_MONTO ASC) AS RN
  FROM calc WHERE DELTA_MONTO < 0
)
SELECT 'CRECIERON' AS TIPO, CODIGO, DESCRIPCION, V2024, V2025, DELTA_MONTO
FROM ranked_up WHERE RN <= 10
UNION ALL
SELECT 'DECRECIERON', CODIGO, DESCRIPCION, V2024, V2025, DELTA_MONTO
FROM ranked_down WHERE RN <= 10
ORDER BY TIPO DESC, DELTA_MONTO DESC`,
    };
  }

  return null;
}

function formatQ1(rows: Record<string, unknown>[]): string {
  const byYear = new Map<number, number>();
  for (const r of rows) {
    byYear.set(rowNum(r, "ANIO"), rowNum(r, "VENTA_NETA"));
  }
  const v24 = byYear.get(2024) ?? 0;
  const v25 = byYear.get(2025) ?? 0;
  const pct = v24 ? ((v25 - v24) / v24) * 100 : 0;
  const chart = chartBlock(
    "bar",
    [
      { periodo: "T1", y2024: v24, y2025: v25 },
    ],
    "periodo",
    [
      { key: "y2024", name: "2024", color: chartColorAt(0) },
      { key: "y2025", name: "2025", color: chartColorAt(1) },
    ]
  );
  return `**Ventas netas — primer trimestre (T1)**

| Año | Venta neta T1 |
|-----|----------------|
| 2024 | ${fmtUsd(v24)} |
| 2025 | ${fmtUsd(v25)} |

**Variación T1 2025 vs 2024:** ${fmtUsd(v25 - v24)} (${fmtPct(pct)}).
${chart}`;
}

function formatQ2(rows: Record<string, unknown>[]): string {
  const byYear = new Map<number, number>();
  for (const r of rows) {
    byYear.set(rowNum(r, "ANIO"), rowNum(r, "VENTA_NETA"));
  }
  const v24 = byYear.get(2024) ?? 0;
  const v25 = byYear.get(2025) ?? 0;
  const pct = v24 ? ((v25 - v24) / v24) * 100 : 0;
  const chart = chartBlock(
    "bar",
    rows.map((r) => ({
      anio: String(rowNum(r, "ANIO")),
      venta: rowNum(r, "VENTA_NETA"),
    })),
    "anio",
    [{ key: "venta", name: "Venta neta", color: chartColorAt(0) }]
  );
  return `**Comparación anual de ventas netas**

| Año | Venta neta |
|-----|------------|
| 2024 | ${fmtUsd(v24)} |
| 2025 | ${fmtUsd(v25)} |

**Variación 2025 vs 2024:** ${fmtUsd(v25 - v24)} (${fmtPct(pct)}).
${chart}`;
}

function formatQ3(rows: Record<string, unknown>[]): string {
  const total = rows.reduce((s, r) => s + rowNum(r, "VENTA_NETA"), 0);
  const lines = rows.map((r, i) => {
    const v = rowNum(r, "VENTA_NETA");
    const pct = total ? (v / total) * 100 : 0;
    return `| ${i + 1} | ${rowStr(r, "DESCRIPCION") || rowStr(r, "CODIGO")} | ${fmtUsd(v)} | ${pct.toFixed(2)}% |`;
  });
  return `**Top 10 productos más vendidos — 2025**

| # | Producto | Ventas 2025 | Participación |
|---|----------|-------------|---------------|
${lines.join("\n")}

Total año 2025 (muestra top 10): ${fmtUsd(total)} en estos productos.`;
}

function formatQ4(rows: Record<string, unknown>[]): string {
  const topUtil = [...rows].sort(
    (a, b) => rowNum(b, "UTILIDAD") - rowNum(a, "UTILIDAD")
  )[0];
  const lines = rows.map((r, i) => {
    return `| ${i + 1} | ${rowStr(r, "NOMBRE_COMPLETO")} | ${fmtUsd(rowNum(r, "VENTA_NETA"))} | ${fmtUsd(rowNum(r, "UTILIDAD"))} |`;
  });
  const chart = chartBlock(
    "bar",
    rows.slice(0, 8).map((r) => ({
      cliente: rowStr(r, "NOMBRE_COMPLETO").slice(0, 28),
      venta: rowNum(r, "VENTA_NETA"),
    })),
    "cliente",
    [{ key: "venta", name: "Venta neta", color: chartColorAt(0) }]
  );
  return `**Clientes destacados — 2024 (top 10 por ventas)**

| # | Cliente | Venta neta | Utilidad |
|---|---------|------------|----------|
${lines.join("\n")}

Mayor **utilidad** en el top: **${rowStr(topUtil, "NOMBRE_COMPLETO")}** (${fmtUsd(rowNum(topUtil, "UTILIDAD"))}).
${chart}`;
}

function formatQ5(rows: Record<string, unknown>[]): string {
  const pivot = new Map<string, { y24: number; y25: number }>();
  for (const r of rows) {
    const t = `T${rowNum(r, "TRIMESTRE")}`;
    const anio = rowNum(r, "ANIO");
    const v = rowNum(r, "VENTA_NETA");
    const cur = pivot.get(t) ?? { y24: 0, y25: 0 };
    if (anio === 2024) cur.y24 = v;
    if (anio === 2025) cur.y25 = v;
    pivot.set(t, cur);
  }
  const lines: string[] = [];
  let best = { label: "", v: -1 };
  let worst = { label: "", v: Number.MAX_VALUE };
  for (const [t, { y24, y25 }] of Array.from(pivot.entries())) {
    lines.push(`| ${t} | ${fmtUsd(y24)} | ${fmtUsd(y25)} |`);
    const max = Math.max(y24, y25);
    const min = Math.min(y24, y25);
    const maxYear = max === y25 ? "2025" : "2024";
    if (max > best.v) best = { label: `${t} (${maxYear})`, v: max };
    if (min < worst.v) worst = { label: `${t}`, v: min };
  }
  const chartData = ["T1", "T2", "T3", "T4"].map((t) => {
    const p = pivot.get(t) ?? { y24: 0, y25: 0 };
    return { trimestre: t, v2024: p.y24, v2025: p.y25 };
  });
  const chart = chartBlock("line", chartData, "trimestre", [
    { key: "v2024", name: "2024", color: chartColorAt(0) },
    { key: "v2025", name: "2025", color: chartColorAt(1) },
  ]);
  return `**Ventas netas por trimestre — 2024 vs 2025**

| Trimestre | 2024 | 2025 |
|-----------|------|------|
${lines.join("\n")}

**Mejor trimestre (mayor venta en el par):** ${best.label}. **Más bajo:** ${worst.label}.
${chart}`;
}

function formatQ6(rows: Record<string, unknown>[]): string {
  const up = rows.filter((r) => rowStr(r, "TIPO") === "CRECIERON");
  const down = rows.filter((r) => rowStr(r, "TIPO") === "DECRECIERON");
  const fmtRow = (r: Record<string, unknown>) => {
    const v24 = rowNum(r, "V2024");
    const v25 = rowNum(r, "V2025");
    const d = rowNum(r, "DELTA_MONTO");
    const pct = v24 ? (d / v24) * 100 : 0;
    return `| ${rowStr(r, "DESCRIPCION") || rowStr(r, "CODIGO")} | ${fmtUsd(v24)} | ${fmtUsd(v25)} | ${fmtUsd(d)} | ${fmtPct(pct)} |`;
  };
  const chart = chartBlock(
    "bar",
    up.slice(0, 5).map((r) => ({
      producto: (rowStr(r, "DESCRIPCION") || rowStr(r, "CODIGO")).slice(0, 24),
      delta: rowNum(r, "DELTA_MONTO"),
    })),
    "producto",
    [{ key: "delta", name: "Crecimiento USD", color: chartColorAt(2) }]
  );
  return `**Productos con mayor crecimiento y mayor caída (2024 → 2025)**

### Top 10 que **crecieron**
| Producto | Ventas 2024 | Ventas 2025 | Δ monto | Δ % |
|----------|-------------|-------------|---------|-----|
${up.map(fmtRow).join("\n")}

### Top 10 que **decrecieron**
| Producto | Ventas 2024 | Ventas 2025 | Δ monto | Δ % |
|----------|-------------|-------------|---------|-----|
${down.map(fmtRow).join("\n")}
${chart}`;
}

function formatAnswer(id: PlaybookId, rows: Record<string, unknown>[]): string {
  switch (id) {
    case "q1_trimestre_2024_2025":
      return formatQ1(rows);
    case "q2_anual_2024_2025":
      return formatQ2(rows);
    case "q3_top10_productos_2025":
      return formatQ3(rows);
    case "q4_clientes_2024":
      return formatQ4(rows);
    case "q5_trimestres_2024_2025":
      return formatQ5(rows);
    case "q6_productos_crecimiento":
      return formatQ6(rows);
    default:
      return "Sin formato playbook.";
  }
}

/** Ejecuta SQL del playbook y devuelve markdown listo para el chat. */
export async function runPlaybookAnswer(userText: string): Promise<string | null> {
  const match = matchPlaybook(userText);
  if (!match) return null;
  const raw = await runConsultarDatosForSkill(match.sql, SKILL_GATE_COMERCIAL);
  const parsed = JSON.parse(raw) as { rows?: Record<string, unknown>[] };
  const rows = parsed.rows ?? [];
  return formatAnswer(match.id, rows);
}
