/**
 * Catálogo verificado de bandavanoni_new_2018_resp (única base permitida).
 * Generado contra SQL Server: ~487 tablas, 6 vistas (solo clasificaciones1–6).
 * NO existen: V_MAESTRA_*, META_STOCK_CLASIFICADO, V_METADATA_SISTEMA.
 */

export const BANDAVONI_DB_NAME = "bandavanoni_new_2018_resp";

/** Tablas ERP usables por skill (SELECT + WITH NOLOCK). */
export const BANDAVONI_ERP_TABLES = [
  "FAC_FACTURAS",
  "FAC_FACTURA_DETALLE",
  "FAC_CLIENTES",
  "FAC_VEND",
  "FAC_CARTERA",
  "FAC_STOCK",
  "FAC_BIEN_SERV",
  "FAC_LOCALES",
  "FAC_MOVIMIENTOS",
  "FAC_CIERRE_CAJA",
  "FAC_COMPRAS",
  "FAC_COMPRA",
  "FAC_COMPRA_DETALLE",
  "FAC_DET_PAGOS_PROVEEDOR",
  "FAC_CHE_PROVEEDORES",
  "FAC_RETENCIONES_SRI",
  "BCO",
  "TES_FLUJO",
  "TES_CAJA",
] as const;

export const BANDAVONI_DB_CATALOG_APPEND = `

═══════════════════════════════════════════════════════
 BASE ÚNICA — ${BANDAVONI_DB_NAME} (OBLIGATORIO)
═══════════════════════════════════════════════════════
• **Solo** consultas contra la base conectada (\`DB_NAME=${BANDAVONI_DB_NAME}\`).
• **Prohibido** \`[banda].[dbo].[...]\`, \`GestionBI\`, o cualquier otra base.
• Califica tablas como \`dbo.meta_venta_neta WITH (NOLOCK)\` o \`dbo.FAC_CARTERA WITH (NOLOCK)\`.
• **No existen** en esta BD las vistas \`V_MAESTRA_*\`, \`V_METADATA_SISTEMA\`, \`V_PLAN_CUENTAS\`.
• **No existe** tabla \`META_STOCK_CLASIFICADO\` / \`meta_stock_clasificado\`. Stock → \`dbo.FAC_STOCK\` + \`dbo.FAC_BIEN_SERV\` + \`dbo.FAC_LOCALES\`. Los SP \`USP_STK_CLASIFICADO*\` no se ejecutan (solo SELECT).

─── Cobertura META (verificado) ───
• \`dbo.meta_venta_neta\`: **113.126** filas; \`PERIODO\` **varchar(6)** \`YYYYMM\` desde **201801** hasta **202508**; \`ANIO\` **2018–2025**.
• \`ANIO=2025\`: \`SEMANA\` aprox. **2–35** (no asumir semana 1 con datos).
• \`CLAS_CLIENTE3\` = segmento/canal real (MAYORISTA, IESS, CONSUMIDOR FINAL, MSP, JUNTA, …) — **no** columna CANAL.

─── SQL de referencia (ventas — copiar patrón) ───
\`\`\`sql
-- Bodegas
SELECT DISTINCT NOMBRE_BODEGA
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE NULLIF(LTRIM(RTRIM(NOMBRE_BODEGA)), N'') IS NOT NULL;

-- Ventas por trimestre (2024)
SELECT TRIMESTRE, SUM(VENTA_NETA) AS total_venta
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY TRIMESTRE ORDER BY TRIMESTRE;

-- Ventas por semana (2024)
SELECT SEMANA, SUM(VENTA_NETA) AS total_venta
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY SEMANA ORDER BY SEMANA;

-- Canal / segmento (retail, corporativo, etc. → CLAS_CLIENTE3)
SELECT CLAS_CLIENTE3,
       SUM(COSTO) AS costo, SUM(VENTA_NETA) AS venta_neta, SUM(UTILIDAD) AS utilidad
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY CLAS_CLIENTE3 ORDER BY CLAS_CLIENTE3;

-- Clientes con caída 2024 vs 2025
SELECT NOMBRE_COMPLETO,
       SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) AS venta_2024,
       SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END) AS venta_2025
FROM dbo.meta_venta_neta WITH (NOLOCK)
GROUP BY NOMBRE_COMPLETO
HAVING SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END) > 0
   AND SUM(CASE WHEN ANIO = 2025 THEN VENTA_NETA ELSE 0 END)
       < SUM(CASE WHEN ANIO = 2024 THEN VENTA_NETA ELSE 0 END);

-- Clientes nuevos (primer mes 202401)
SELECT DISTINCT RUC, NOMBRE_COMPLETO
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202401'
  AND RUC IS NOT NULL
  AND RUC NOT IN (
    SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6)) < '202401'
  );

-- % participación por cliente (mes 202401)
SELECT NOMBRE_COMPLETO,
       100.0 * SUM(VENTA_NETA) / NULLIF((
         SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK)
         WHERE CAST(PERIODO AS VARCHAR(6)) = '202401'
       ), 0) AS porcentaje
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202401'
GROUP BY NOMBRE_COMPLETO
ORDER BY porcentaje DESC;

-- Margen por línea de producto (CLASIFICACION1)
WITH base AS (
  SELECT * FROM dbo.meta_venta_neta WITH (NOLOCK)
  WHERE CAST(PERIODO AS VARCHAR(6)) = '202501'
)
SELECT CLASIFICACION1 AS linea,
       SUM(VENTA_NETA) AS total_ventas,
       SUM(UTILIDAD) AS utilidad,
       100.0 * SUM(UTILIDAD) / NULLIF(SUM(VENTA_NETA), 0) AS margen_pct
FROM base GROUP BY CLASIFICACION1 ORDER BY total_ventas DESC;

-- Ventas mensuales año 2025
SELECT CAST(PERIODO AS VARCHAR(6)) AS mes, SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2025
GROUP BY CAST(PERIODO AS VARCHAR(6)) ORDER BY mes;

-- Top 10 clientes facturación (A07 — año 2024 por defecto)
SELECT TOP 10 NOMBRE_COMPLETO, SUM(VENTA_NETA) AS total
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY NOMBRE_COMPLETO ORDER BY total DESC;

-- Clientes en caída 2024→2025 con COUNT (A08)
WITH caida AS (
  SELECT NOMBRE_COMPLETO,
    SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) AS v2024,
    SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END) AS v2025
  FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY NOMBRE_COMPLETO
  HAVING SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) > 0
     AND SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END)
         < SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END)
),
tot AS (SELECT COUNT(*) AS n FROM caida)
SELECT 'RESUMEN' AS seccion, CAST(n AS VARCHAR(12)) AS NOMBRE_COMPLETO, n AS total
FROM tot
UNION ALL
SELECT 'DETALLE', NOMBRE_COMPLETO, v2024 FROM caida;

-- Exportación completa A08 (usar en exportData; sin UNION ALL)
-- Ver SQL_EXPORT_CLIENTES_CAIDA_2024_2025 en listadoEnrichment.ts

-- Productos margen negativo (B03) — COUNT + listado
WITH neg AS (
  SELECT CODIGO, SUM(UTILIDAD) AS util
  FROM dbo.meta_venta_neta WITH (NOLOCK)
  WHERE ANIO = 2025
  GROUP BY CODIGO HAVING SUM(UTILIDAD) < 0
),
tot AS (SELECT COUNT(*) AS n FROM neg)
SELECT 'RESUMEN' AS seccion, CAST(n AS VARCHAR(12)) AS CODIGO, n AS utilidad FROM tot
UNION ALL
SELECT 'DETALLE', CODIGO, util FROM neg;

-- Retenciones SRI (C10)
SELECT SUM(ISNULL(FRS_VALOR,0)) AS total_retenciones, COUNT(*) AS registros
FROM dbo.FAC_RETENCIONES_SRI WITH (NOLOCK);

-- IVA gravado/exento año 2024 (C11)
SELECT SUM(CASE WHEN ISNULL(IVA,0)>0 THEN VENTA_NETA ELSE 0 END) AS gravadas,
       SUM(CASE WHEN ISNULL(IVA,0)=0 THEN VENTA_NETA ELSE 0 END) AS exentas,
       SUM(IVA) AS iva_total
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024;

-- Descuento promedio % año 2024 (C04)
SELECT 100.0*SUM(ISNULL(DCTO_NETO,0))/NULLIF(SUM(VENTA_NETA)+SUM(ISNULL(DCTO_NETO,0)),0) AS pct_descuento
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024;
SELECT COUNT(*) AS inactivos FROM (
  SELECT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL
  GROUP BY RUC HAVING MAX(CAST(PERIODO AS VARCHAR(6))) < '202506'
) x;
\`\`\`

─── Mapa preguntas.md → fuente ───
| Área | IDs | Tabla principal | Notas |
| A ventas/clientes | A01–A10 | meta_venta_neta | Canal=\`CLAS_CLIENTE3\`; vendedor=\`VENDEDOR\`; top clientes=\`NOMBRE_COMPLETO\` |
| B rentabilidad | B01–B08 | meta_venta_neta | Margen = \`SUM(UTILIDAD)/SUM(VENTA_NETA)\`; producto=\`CODIGO\`+\`DESCRIPCION\` |
| C gestión comercial | C01–C13 | FAC_FACTURAS, FAC_CIERRE_CAJA, meta | Anuladas: \`FFG_ANULADO='N'\`; descuentos \`FFG_DESCUENTO\`, \`DCTO_*\` en META |
| D cartera | D01–D10 | FAC_CARTERA + FAC_CLIENTES | Saldo = \`FCC_VALOR - FCC_PAGADO\`; **vencimiento = FCC_VEND** (NO existe FECHA_VENCE) |
| E CxP | E01–E10 | FAC_COMPRAS, FAC_DET_PAGOS_PROVEEDOR, FAC_CHE_PROVEEDORES | |
| F inventario | F01–F10 | FAC_STOCK, FAC_BIEN_SERV, FAC_LOCALES | \`STK_ACTUAL\`, \`STK_MINIMO\`, \`STK_COSTO_ACTUAL\`; bodega en META: \`NOMBRE_BODEGA\` |
| G costos inv. | G01–G10 | FAC_STOCK, FAC_MOVIMIENTOS | \`FMO_TIPO\` 10=compra, 40=venta, 60=NC |
| H rotación | H01–H10 | FAC_STOCK + meta_venta_neta | JOIN \`FAC_BIEN_SERV.TBS_CODIGO\` = \`meta.CODIGO\` |
| I tesorería | I01–I10 | BCO, TES_FLUJO, TES_CAJA, FAC_CIERRE_CAJA | \`TES_FLUJO\` puede estar vacía en restauración |
| J–L estados financieros | J01–L10 | Limitado | Sin capa contable BI; usar META + FAC_* y declarar límite si no hay saldos |

─── Cartera (errores frecuentes) ───
• \`FAC_CARTERA\`: \`FCC_FECHA\` emisión, \`FCC_VEND\` **fecha vencimiento**, \`FCC_STATUS\` (P/C/A o NULL).
• Antigüedad: \`DATEDIFF(day, FCC_VEND, GETDATE())\` sobre saldo \`FCC_VALOR - FCC_PAGADO > 0\`.

─── Inventario ───
\`\`\`sql
SELECT s.TBS_CODIGO, b.TBS_DESCRIPCION, l.LOC_NOMBRE,
       s.STK_ACTUAL, s.STK_MINIMO, s.STK_COSTO_ACTUAL,
       s.STK_ACTUAL * ISNULL(s.STK_COSTO_ACTUAL, 0) AS valor_costo
FROM dbo.FAC_STOCK s WITH (NOLOCK)
JOIN dbo.FAC_BIEN_SERV b WITH (NOLOCK) ON b.TBS_CODIGO = s.TBS_CODIGO
JOIN dbo.FAC_LOCALES l WITH (NOLOCK) ON l.LOC_NUMERO = s.STK_BODEGA
WHERE s.STK_ACTUAL > 0;
\`\`\`

─── Facturas hoy ───
\`\`\`sql
SELECT SUM(FFG_TOTAL) FROM dbo.FAC_FACTURAS WITH (NOLOCK)
WHERE FFG_ANULADO = 'N' AND CAST(FFG_FECHA AS DATE) = CAST(GETDATE() AS DATE);
\`\`\`
`;
