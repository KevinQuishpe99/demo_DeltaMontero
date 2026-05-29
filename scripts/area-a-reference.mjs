/**
 * SQL de referencia verificado — Área A (A01–A10).
 * Usado por audit-area-a.mjs y validate-preguntas-ia.mjs
 */
export function buildAreaAReferences(ctx) {
  const { maxPeriodo, anioRef, periodoPrevYear, anioComparacion = 2024 } = ctx;

  return {
    A01: {
      sql: `SELECT SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '${maxPeriodo}'`,
      metric: "total_ventas",
      label: "Ventas totales último período cargado",
    },
    A02: {
      sql: `SELECT
  SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}' THEN VENTA_NETA ELSE 0 END) AS mes_actual,
  SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='${periodoPrevYear}' THEN VENTA_NETA ELSE 0 END) AS mismo_mes_anio_ant
FROM dbo.meta_venta_neta WITH (NOLOCK)`,
      metric: "multi",
      label: "Comparativo mes actual vs mismo mes año anterior",
    },
    A03: {
      sql: `SELECT
  SUM(CASE WHEN ANIO=${anioRef} THEN VENTA_NETA ELSE 0 END) AS ytd_actual,
  SUM(CASE WHEN ANIO=${anioRef - 1} THEN VENTA_NETA ELSE 0 END) AS ytd_anterior
FROM dbo.meta_venta_neta WITH (NOLOCK)`,
      metric: "ytd_actual",
      label: "YTD año en curso en datos",
    },
    A04: {
      sql: `SELECT TOP 1 CLASIFICACION1 AS linea, SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '${maxPeriodo}'
GROUP BY CLASIFICACION1
ORDER BY total_ventas DESC`,
      metric: "total_ventas",
      label: `Top línea producto período ${maxPeriodo}`,
    },
    A05: {
      sql: `SELECT CLAS_CLIENTE3, SUM(COSTO) AS costo, SUM(VENTA_NETA) AS venta_neta, SUM(UTILIDAD) AS utilidad
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = ${anioComparacion}
GROUP BY CLAS_CLIENTE3
ORDER BY CLAS_CLIENTE3`,
      metric: "venta_neta_sum",
      aggregateSql: `SELECT SUM(VENTA_NETA) AS venta_neta_sum FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = ${anioComparacion}`,
      label: `Ventas por canal CLAS_CLIENTE3 año ${anioComparacion}`,
    },
    A06: {
      sql: `SELECT TOP 10 VENDEDOR, SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = ${anioComparacion}
GROUP BY VENDEDOR
ORDER BY total_ventas DESC`,
      metric: "total_ventas",
      label: `Top vendedor año ${anioComparacion}`,
    },
    A07: {
      sql: `SELECT TOP 10 NOMBRE_COMPLETO, SUM(VENTA_NETA) AS total_facturacion
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = ${anioComparacion}
GROUP BY NOMBRE_COMPLETO
ORDER BY total_facturacion DESC`,
      metric: "total_facturacion",
      label: `Top 10 clientes año ${anioComparacion}`,
    },
    A08: {
      sql: `SELECT COUNT(*) AS clientes_en_caida FROM (
  SELECT NOMBRE_COMPLETO
  FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY NOMBRE_COMPLETO
  HAVING SUM(CASE WHEN ANIO=${anioComparacion} THEN VENTA_NETA ELSE 0 END) > 0
     AND SUM(CASE WHEN ANIO=${anioRef} THEN VENTA_NETA ELSE 0 END)
         < SUM(CASE WHEN ANIO=${anioComparacion} THEN VENTA_NETA ELSE 0 END)
) x`,
      metric: "clientes_en_caida",
      label: `Clientes con caída ${anioComparacion}→${anioRef}`,
    },
    A09: {
      sql: `SELECT COUNT(DISTINCT RUC) AS clientes_nuevos
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '${maxPeriodo}'
  AND RUC IS NOT NULL
  AND RUC NOT IN (
    SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6)) < '${maxPeriodo}'
  )`,
      metric: "clientes_nuevos",
      label: `Clientes nuevos período ${maxPeriodo}`,
    },
    A10: {
      sql: `SELECT TOP 1 NOMBRE_COMPLETO,
  100.0 * SUM(VENTA_NETA) / NULLIF((
    SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE CAST(PERIODO AS VARCHAR(6)) = '${maxPeriodo}'
  ), 0) AS porcentaje
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '${maxPeriodo}'
GROUP BY NOMBRE_COMPLETO
ORDER BY porcentaje DESC`,
      metric: "porcentaje",
      label: `% participación top cliente período ${maxPeriodo}`,
    },
  };
}

/** SQL patrón del usuario (demostración mínima) */
export const USER_DEMO_SQL = [
  { name: "META 2024", sql: "SELECT COUNT(*) AS filas FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024" },
  { name: "Bodegas", sql: "SELECT DISTINCT NOMBRE_BODEGA FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE NULLIF(LTRIM(RTRIM(NOMBRE_BODEGA)), N'') IS NOT NULL" },
  { name: "Trimestre 2024", sql: "SELECT TRIMESTRE, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY TRIMESTRE ORDER BY TRIMESTRE" },
  { name: "Semana 2024", sql: "SELECT SEMANA, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY SEMANA ORDER BY SEMANA" },
  { name: "Canal 2024", sql: "SELECT CLAS_CLIENTE3, SUM(COSTO) AS costo, SUM(VENTA_NETA) AS venta, SUM(UTILIDAD) AS utilidad FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY CLAS_CLIENTE3 ORDER BY CLAS_CLIENTE3" },
  { name: "Caída clientes pivot", sql: `SELECT TOP 5 NOMBRE_COMPLETO,
    SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) AS v2024,
    SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END) AS v2025
  FROM dbo.meta_venta_neta WITH (NOLOCK) GROUP BY NOMBRE_COMPLETO` },
  { name: "Clientes nuevos 202401", sql: `SELECT COUNT(DISTINCT RUC) AS n FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE CAST(PERIODO AS VARCHAR(6))='202401' AND RUC IS NOT NULL
    AND RUC NOT IN (SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6))<'202401')` },
  { name: "Margen línea 202501", sql: `WITH base AS (SELECT * FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202501')
    SELECT TOP 1 CLASIFICACION1, SUM(VENTA_NETA) AS total FROM base GROUP BY CLASIFICACION1 ORDER BY total DESC` },
  { name: "Ventas mensuales 2025", sql: `SELECT CAST(PERIODO AS VARCHAR(6)) AS mes, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2025 GROUP BY CAST(PERIODO AS VARCHAR(6)) ORDER BY mes` },
];
