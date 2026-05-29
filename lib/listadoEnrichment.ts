import type { BiSkillToolName } from "@/lib/biSkillTools";

const SQL_EXPORT_CLIENTES_CAIDA_2024_2025 = `SELECT NOMBRE_COMPLETO,
  SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) AS ventas_2024,
  SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) AS ventas_2025,
  SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END)
    - SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) AS caida_usd,
  CASE WHEN SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) > 0
    THEN 100.0 * (
      SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END)
      - SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END)
    ) / NULLIF(SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END), 0)
    ELSE NULL END AS caida_pct
FROM dbo.meta_venta_neta WITH (NOLOCK)
GROUP BY NOMBRE_COMPLETO
HAVING SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) > 0
  AND SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END)
      < SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END)
ORDER BY caida_usd DESC, NOMBRE_COMPLETO`;

const SQL_CLIENTES_SIN_COMPRAS_2025 = `SELECT NOMBRE_COMPLETO, RUC,
  SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) AS ventas_2024,
  SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) AS ventas_2025
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE RUC IS NOT NULL AND LTRIM(RTRIM(RUC)) <> ''
GROUP BY NOMBRE_COMPLETO, RUC
HAVING SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) = 0
   AND SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) > 0
ORDER BY ventas_2024 DESC, NOMBRE_COMPLETO`;

export type ExportDataTemplate = {
  type: "exportData";
  skill: BiSkillToolName;
  sql: string;
  fileName: string;
  title: string;
  rowCountExpected: number;
};

export type ListadoEnrichment = {
  businessTotal: number | null;
  detalleRowsInSample: number;
  exportDataTemplate: ExportDataTemplate | null;
  /** Bloque listo para pegar en el chat (```json … ```). */
  exportDataJsonBlock: string | null;
};

function stripPaging(sql: string): string {
  return sql
    .replace(/\bTOP\s*\(\s*\d+\s*\)\s*/gi, " ")
    .replace(/\bTOP\s+\d+\s*/gi, " ")
    .replace(
      /\bOFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromSql(sql: string): string {
  const u = sql.toUpperCase();
  if (u.includes("NOT IN") && /PERIODO[^']*'(\d{6})'/i.test(sql)) {
    const p = sql.match(/PERIODO[^']*'(\d{6})'/i)?.[1];
    if (p) return `clientes_nuevos_${p}`;
  }
  const y = sql.match(/\bANIO\s*=\s*(20\d{2})\b/i);
  if (y) return `listado_${y[1]}`;
  return "listado_completo";
}

function titleFromSql(sql: string): string {
  const u = sql.toUpperCase();
  const period = sql.match(/PERIODO[^']*'(\d{6})'/i)?.[1];
  if (period && u.includes("NOT IN") && u.includes("RUC")) {
    const y = period.slice(0, 4);
    const m = period.slice(4, 6);
    return `Clientes nuevos ${m}/${y}`;
  }
  const y = sql.match(/\bANIO\s*=\s*(20\d{2})\b/i)?.[1];
  if (y) return `Listado consulta ${y}`;
  return "Listado completo";
}

/** SELECT de exportación sin TOP, UNION RESUMEN ni columna seccion. */
function deriveExportSql(sourceSql: string): string | null {
  const sql = sourceSql.trim().replace(/;+\s*$/g, "");

  const wrapper = sql.match(
    /^WITH\s+([\s\S]+)\s+SELECT\s+(?:DISTINCT\s+)?['"]?(?:DETALLE|detalle)['"]?\s+AS\s+seccion\s*,\s*([\s\S]+?)\s+FROM\s+(\w+)\s*(?:ORDER\s+BY[\s\S]*)?$/i
  );
  if (wrapper) {
    const [, ctePart, cols, cteName] = wrapper;
    const order =
      /ORDER\s+BY/i.test(sql) && !/ORDER\s+BY/i.test(ctePart)
        ? sql.slice(sql.toUpperCase().lastIndexOf("ORDER BY"))
        : "";
    return `WITH ${ctePart.trim()} SELECT ${cols.trim()} FROM ${cteName}${order ? ` ${order.trim()}` : ""}`;
  }

  const upper = sql.toUpperCase().replace(/\s+/g, " ");
  if (upper.includes("UNION ALL") && upper.includes("RESUMEN")) {
    const cte = sql.match(/\b(\w+)\s+AS\s*\(\s*SELECT/i)?.[1];
    const detalle = sql.match(
      /UNION\s+ALL\s+SELECT\s+'DETALLE'\s*,\s*([\s\S]+?)(?:\s*;|\s*$)/i
    );
    if (cte && detalle) {
      const tail = detalle[1].replace(/\s+FROM\s+\w+\s*$/i, "").trim();
      return `SELECT ${tail} FROM ${cte}`;
    }
    return null;
  }

  const cleaned = stripPaging(sql);
  if (/SELECT\s+'(?:DETALLE|RESUMEN)'/i.test(cleaned)) return null;
  return cleaned;
}

function isCaidaComprasSql(sql: string): boolean {
  const u = sql.toUpperCase().replace(/\s+/g, " ");
  if (!u.includes("2024") || !u.includes("2025")) return false;
  if (!u.includes("META_VENTA_NETA")) return false;
  const hasPivot =
    u.includes("V2024") ||
    u.includes("V2025") ||
    (u.includes("CASE WHEN ANIO") && u.includes("VENTA_NETA"));
  const hasCaida =
    u.includes("CAIDA") ||
    u.includes("V2025 < V2024") ||
    u.includes(
      "SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) < SUM(CASE WHEN ANIO = 2024"
    );
  return hasPivot && hasCaida;
}

function isSinCompras2025Sql(sql: string): boolean {
  const u = sql.toUpperCase().replace(/\s+/g, " ");
  if (!u.includes("META_VENTA_NETA") || !u.includes("2025")) return false;
  if (u.includes("FAC_CLIENTES") && u.includes(" RUC") && !u.includes("FCL_RUC")) {
    return false;
  }
  return (
    u.includes("SUM(CASE WHEN ANIO = 2025") &&
    (u.includes("= 0") || u.includes("=0")) &&
    u.includes("NOT IN")
  ) || (
    u.includes("HAVING") &&
    u.includes("ANIO = 2025") &&
    (u.includes("= 0") || u.includes("=0"))
  );
}

function extractResumenTotal(rows: Record<string, unknown>[]): number | null {
  for (const r of rows) {
    const seccion = String(r.seccion ?? "")
      .trim()
      .toUpperCase();
    if (seccion !== "RESUMEN") continue;
    const candidates = [r.total, r.n, r.valor, r.NOMBRE_COMPLETO];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
  }
  return null;
}

function countDetalleRows(rows: Record<string, unknown>[]): number {
  return rows.filter(
    (r) =>
      String(r.seccion ?? "")
        .trim()
        .toUpperCase() === "DETALLE"
  ).length;
}

function buildExportBlock(template: ExportDataTemplate): string {
  return `\`\`\`json\n${JSON.stringify(template)}\n\`\`\``;
}

/** Plantilla export desde el SQL del turno actual (atajo «dame Excel»). */
export function buildExportTemplateForSql(
  skill: string,
  sourceSql: string,
  rowCountExpected: number
): ExportDataTemplate | null {
  const exportSql = deriveExportSql(sourceSql);
  if (!exportSql || rowCountExpected <= 0) return null;
  return {
    type: "exportData",
    skill: asSkillName(skill),
    sql: exportSql,
    fileName: slugFromSql(sourceSql),
    title: titleFromSql(sourceSql),
    rowCountExpected,
  };
}

/** Reutilizable al responder solo «dame Excel» sin nueva consulta. */
export function formatExportDataJsonBlock(
  template: ExportDataTemplate
): string {
  return buildExportBlock(template);
}

function asSkillName(skill: string): BiSkillToolName {
  const s = skill.trim();
  if (
    s === "consultar_comercial" ||
    s === "consultar_cartera_tesoreria" ||
    s === "consultar_inventario_costos" ||
    s === "analizar_estados_financieros"
  ) {
    return s;
  }
  return "consultar_comercial";
}

function makeExport(
  skill: string,
  sql: string,
  fileName: string,
  title: string,
  total: number,
  detalleRowsInSample: number
): ListadoEnrichment {
  const template: ExportDataTemplate = {
    type: "exportData",
    skill: asSkillName(skill),
    sql,
    fileName,
    title,
    rowCountExpected: total,
  };
  return {
    businessTotal: total,
    detalleRowsInSample,
    exportDataTemplate: template,
    exportDataJsonBlock: buildExportBlock(template),
  };
}

/**
 * Detecta listados RESUMEN/DETALLE y adjunta plantilla exportData para Excel/CSV.
 */
export function enrichListadoPayload(
  rows: Record<string, unknown>[],
  skill: string,
  sourceSql: string,
  sqlAiMaxRows: number,
  truncated: boolean,
  sourceRowsAfterSqlCap: number
): ListadoEnrichment {
  const businessTotal = extractResumenTotal(rows);
  const detalleRowsInSample = countDetalleRows(rows);
  const empty: ListadoEnrichment = {
    businessTotal,
    detalleRowsInSample,
    exportDataTemplate: null,
    exportDataJsonBlock: null,
  };

  const rowSampleCount =
    detalleRowsInSample > 0
      ? detalleRowsInSample
      : rows.filter((r) => String(r.seccion ?? "").toUpperCase() !== "RESUMEN")
          .length;

  const total =
    businessTotal ??
    (truncated && sourceRowsAfterSqlCap > sqlAiMaxRows
      ? sourceRowsAfterSqlCap
      : !truncated && rowSampleCount > 0
        ? rowSampleCount
        : null);

  const exportSql = deriveExportSql(sourceSql);
  const shouldAttachExport =
    exportSql != null &&
    total != null &&
    total > 0 &&
    (total > sqlAiMaxRows ||
      truncated ||
      rowSampleCount >= sqlAiMaxRows ||
      total > 10);

  if (!shouldAttachExport || total == null) return empty;

  if (isCaidaComprasSql(sourceSql)) {
    return makeExport(
      skill,
      SQL_EXPORT_CLIENTES_CAIDA_2024_2025,
      "clientes_caida_compras_2024_2025",
      "Clientes con caída de compras 2024 → 2025 (completo)",
      total,
      detalleRowsInSample
    );
  }

  if (isSinCompras2025Sql(sourceSql)) {
    return makeExport(
      skill,
      SQL_CLIENTES_SIN_COMPRAS_2025,
      "clientes_sin_compras_2025",
      "Clientes sin compras en 2025 (completo)",
      total,
      detalleRowsInSample
    );
  }

  if (exportSql) {
    return makeExport(
      skill,
      exportSql,
      slugFromSql(sourceSql),
      titleFromSql(sourceSql),
      total,
      detalleRowsInSample
    );
  }

  return empty;
}
