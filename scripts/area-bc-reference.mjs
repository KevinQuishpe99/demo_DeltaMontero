/**
 * SQL de referencia — Áreas B (rentabilidad) y C (gestión comercial).
 */
export function buildAreaBCReferences(ctx) {
  const { maxPeriodo, anioRef, anioComparacion = 2024, mesInactivoCutoff = "202506" } = ctx;

  return {
    B01: {
      sql: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202501'
GROUP BY CLASIFICACION1 ORDER BY SUM(VENTA_NETA) DESC`,
      metric: "margen",
      label: "Margen % top línea ene-2025",
    },
    B02: {
      sql: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202401'
GROUP BY NOMBRE_COMPLETO ORDER BY SUM(VENTA_NETA) DESC`,
      metric: "margen",
      label: "Margen % top cliente ene-2024",
    },
    B03: {
      sql: `SELECT COUNT(*) AS n FROM (
  SELECT CODIGO FROM dbo.meta_venta_neta WITH (NOLOCK)
  WHERE ANIO=${anioRef} GROUP BY CODIGO HAVING SUM(UTILIDAD)<0
) x`,
      metric: "n",
      label: `Productos margen negativo ${anioRef}`,
    },
    B04: {
      sql: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=${anioComparacion}
GROUP BY CLAS_CLIENTE3 ORDER BY SUM(VENTA_NETA) DESC`,
      metric: "margen",
      label: `Rentabilidad % top canal ${anioComparacion}`,
    },
    B05: {
      qualitative: true,
      passPattern: /ticket\s+promedio/i,
      sql: `SELECT TOP 5 NOMBRE_COMPLETO, SUM(VENTA_NETA)/NULLIF(COUNT(DISTINCT NUMERO),0) AS ticket
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioComparacion}
GROUP BY NOMBRE_COMPLETO ORDER BY SUM(VENTA_NETA) DESC`,
      label: "Ticket promedio por cliente (listado con cifras)",
    },
    B06: {
      sql: `SELECT TOP 1 VENDEDOR, SUM(VENTA_NETA)/NULLIF(COUNT(DISTINCT NUMERO),0) AS ticket
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=${anioComparacion}
GROUP BY VENDEDOR ORDER BY ticket DESC`,
      metric: "ticket",
      label: `Ticket promedio top vendedor ${anioComparacion}`,
    },
    B07: {
      sql: `SELECT TOP 1 CODIGO, SUM(COSTO) AS costo
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=${anioComparacion}
GROUP BY CODIGO ORDER BY costo DESC`,
      metric: "costo",
      matchLargest: true,
      label: `Costo ventas top producto ${anioComparacion}`,
    },
    B08: {
      qualitative: true,
      passPattern: /costos?\s+fijos?|no (hay|existen|disponible)|no se puede|limitad|sin datos|gastos?\s+operativos?/i,
      sql: null,
      label: "Sin tabla costos fijos — IA debe declarar límite",
    },
    C01: {
      sql: `SELECT
  (SELECT COUNT(*) FROM dbo.FAC_FACTURAS WITH (NOLOCK) WHERE FFG_ANULADO='N') AS facturas_emitidas,
  (SELECT SUM(FCC_VALOR-FCC_PAGADO) FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE FCC_VALOR-FCC_PAGADO>0) AS pendiente_cobro`,
      metric: "multi",
      matchAny: true,
      label: "Facturas emitidas + cartera pendiente",
    },
    C02: {
      sql: `SELECT SUM(VENTA_NETA) AS total_nc
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}' AND VENTA_NETA<0`,
      metric: "total_nc",
      abs: true,
      label: `NC período ${maxPeriodo}`,
    },
    C03: {
      sql: `SELECT TOP 1 NOMBRE_COMPLETO, SUM(ISNULL(DCTO_NETO,0)) AS descuento
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=${anioComparacion}
GROUP BY NOMBRE_COMPLETO ORDER BY descuento DESC`,
      metric: "descuento",
      label: `Mayor descuento por cliente ${anioComparacion}`,
    },
    C04: {
      sql: `SELECT 100.0*SUM(ISNULL(DCTO_NETO,0))/NULLIF(SUM(VENTA_NETA)+SUM(ISNULL(DCTO_NETO,0)),0) AS pct_descuento
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioComparacion}`,
      metric: "pct_descuento",
      label: `Descuento promedio % ${anioComparacion}`,
    },
    C05: {
      sql: `SELECT TOP 1 100.0*SUM(VENTA_NETA)/NULLIF((SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioComparacion}),0) AS concentracion
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=${anioComparacion}
GROUP BY NOMBRE_COMPLETO ORDER BY concentracion DESC`,
      metric: "concentracion",
      label: `Concentración top cliente % ${anioComparacion}`,
    },
    C06: {
      sql: `SELECT
  (SELECT COUNT(*) FROM (SELECT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL GROUP BY RUC HAVING MAX(CAST(PERIODO AS VARCHAR(6))) < '${mesInactivoCutoff}') x) AS inactivos_3m,
  (SELECT COUNT(*) FROM (SELECT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL GROUP BY RUC HAVING MAX(CAST(PERIODO AS VARCHAR(6))) < '202503') x) AS inactivos_6m`,
      metric: "multi",
      matchAny: true,
      label: "Clientes inactivos 3/6 meses (aprox)",
    },
    C07: {
      sql: `SELECT SUM(VENTA_NETA) AS ventas_mes_actual
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}'`,
      metric: "ventas_mes_actual",
      label: `Base proyección cierre mes ${maxPeriodo}`,
    },
    C08: {
      sql: `SELECT SUM(VENTA_NETA) AS ytd
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef}`,
      metric: "ytd",
      label: `YTD ${anioRef} base proyección anual`,
    },
    C09: {
      sql: `SELECT SUM(FCC_VALOR-FCC_PAGADO) AS ventas_no_cobradas
FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE FCC_VALOR-FCC_PAGADO>0`,
      metric: "ventas_no_cobradas",
      label: "Cartera pendiente (facturado no cobrado)",
    },
    C10: {
      sql: `SELECT SUM(ISNULL(FRS_VALOR,0)) AS total_retenciones, COUNT(*) AS n_registros
FROM dbo.FAC_RETENCIONES_SRI WITH (NOLOCK)`,
      metric: "multi",
      matchAny: true,
      label: "Retenciones SRI valor y/o conteo",
    },
    C11: {
      sql: `SELECT
  SUM(CASE WHEN ISNULL(IVA,0)>0 THEN VENTA_NETA ELSE 0 END) AS gravadas,
  SUM(CASE WHEN ISNULL(IVA,0)=0 THEN VENTA_NETA ELSE 0 END) AS exentas,
  SUM(IVA) AS iva_total
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioComparacion}`,
      metric: "multi",
      matchAny: true,
      label: `IVA gravado/exento ${anioComparacion}`,
    },
    C12: {
      sql: `SELECT COUNT(*) AS alertas FROM (
  SELECT NOMBRE_COMPLETO FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY NOMBRE_COMPLETO
  HAVING SUM(CASE WHEN ANIO=${anioComparacion} THEN VENTA_NETA ELSE 0 END) > 0
     AND SUM(CASE WHEN ANIO=${anioRef} THEN VENTA_NETA ELSE 0 END)
         < SUM(CASE WHEN ANIO=${anioComparacion} THEN VENTA_NETA ELSE 0 END)
) x`,
      metric: "alertas",
      label: `Clientes con caída ventas ${anioComparacion}→${anioRef}`,
    },
    C13: {
      sql: `SELECT COUNT(*) AS cierres FROM dbo.FAC_CIERRE_CAJA WITH (NOLOCK)`,
      metric: "cierres",
      label: "Total cierres de caja históricos",
    },
  };
}
