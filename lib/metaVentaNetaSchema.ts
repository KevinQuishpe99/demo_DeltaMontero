/**
 * Esquema de referencia META_VENTA_NETA en ERP Banda Vanoni.
 * PERIODO es varchar; en esta base no asumas ORIGEN/CANAL/COSTO_TOTAL (no dependas de V_MAESTRA_VENTAS en **consultar_comercial**).
 */

export const META_VENTA_NETA_MANUAL_BLOCK = `

═══════════════════════════════════════════════════════
 META_VENTA_NETA — perfil base activa (bandavanoni_new_2018_resp)
═══════════════════════════════════════════════════════
• Fuente obligatoria: \`dbo.meta_venta_neta\` (base bandavanoni_new_2018_resp).
• Esta base tiene \`ANIO\` (int), \`TRIMESTRE\`, \`SEMANA\`; \`PERIODO\` es **varchar(6)**.
• **Formato de PERIODO:** siempre **6 caracteres AñoMes → \`YYYYMM\`**. Ej.: enero 2025 = **\`'202501'\`**; **no** existe forma válida tipo \`20251\` (faltan dígitos y rompe el corte mensual).

═══════════════════════════════════════════════════════
 Filtros de tiempo — PERIODO vs FECHA vs ANIO+SEMANA (Vanoni)
═══════════════════════════════════════════════════════
• **¿Por qué a veces aparece \`(YEAR(FECHA)*100+MONTH(FECHA)) = 202501\`?** Es solo una forma **numérica** de armar el mismo mes calendario que **\`'202501'\`** directamente desde la fecha del movimiento. Útil para cortes **dinámicos** (\`GETDATE()\`, comparativos “este mes”) sin concatenar strings; **no** es obligatorio si ya tienes \`PERIODO\` alineado.
• **Preferencia práctica para la IA (META Vanoni):**
  1) **Mes explícito** (“enero 2025”, “feb 2024”) → prioriza \`CAST(NULLIF(LTRIM(RTRIM(PERIODO)), N'') AS VARCHAR(6)) = 'YYYYMM'\` (ej. **\`'202501'\`**). Suele ser más claro y alineado al período contable cargado en META.
  2) **Mes dinámico** (“actual”, “este mes”, “mes actual”, “del mes”) → **calendario de hoy**: \`CAST(PERIODO AS VARCHAR(6)) = FORMAT(GETDATE(), 'yyyyMM')\`. Si ese YYYYMM **>** \`PERIODO_MAXIMO\` en metadata → **no consultes** META; responde que no hay datos del mes calendario actual y cita hasta qué mes/fecha sí hay.
  3) **Hoy / del día** → \`CAST(FECHA AS DATE) = CAST(GETDATE() AS DATE)\` en META; facturación del día → \`FAC_FACTURAS\` con \`CAST(FFG_FECHA AS DATE) = CAST(GETDATE() AS DATE)\`.
  4) **Año completo** → \`WHERE ANIO = 2025\` si existe la columna; si **Msg 207**, \`WHERE YEAR(FECHA) = 2025\`.
  5) **Ventas por semana de negocio** → \`WHERE ANIO = 2025\` y \`GROUP BY SEMANA ORDER BY SEMANA\`; si piden **una semana concreta** (ej. “semana 1”), combina \`ANIO\` + \`SEMANA = 1\` **solo si** en tu ERP esa numeración corresponde a lo que el usuario entiende por “semana 1” (semántica de \`SEMANA\` = calendario interno del ERP).
• Si una consulta con \`PERIODO\` devuelve 0 filas y esperabas datos, **prueba el mismo filtro con \`FECHA\`** (o viceversa) para descartar desfaces de carga; no inventes períodos mal formados (\`'20251'\`).

═══════════════════════════════════════════════════════
 dbo.meta_venta_neta — columnas (referencia)
═══════════════════════════════════════════════════════
Tipos frecuentes: IDREGISTRO decimal; PERIODO varchar(6); FECHA datetime; SERIE/NUMERO decimal; importes decimal.
  **ANIO / TRIMESTRE / SEMANA:** presentes y usables en esta base.
  **Calendario granular (agrupar sin SELECT *):**
  • \`PERIODO\` **varchar(6)** tipo **YYYYMM** (mes contable / período ERP); coherente con \`FECHA\` en datos revisados.
  • \`SEMANA\`: número de semana de negocio en el año (usar junto a \`ANIO\` cuando agrupes por semana).
  • \`DIA\`: **día del mes** (típico rango **1–31**); redundante con \`DAY(FECHA)\` pero útil para GROUP BY sin función sobre la fecha.
  • \`DIAY\`: **día del año** (en muestras ~**1–366**); redundante con algo como \`DATEPART(DAYOFYEAR, FECHA)\`.
  • \`DIAS\`: **varchar** con forma \`«número» «texto»\` (ej. \`4 Miercoles\`). Verificado en **bandavanoni_new_2018_resp**: el **primer número** coincide con el día de la semana si en SQL usas **semana que empieza en lunes**: \`SET DATEFIRST 1;\` luego \`DATEPART(WEEKDAY, FECHA)\` → **1=lunes, 2=martes, …, 7=domingo** (convención tipo ISO, **no** “domingo=1 … sábado=7”). La **parte textual** del nombre del día **puede no coincidir** con \`FECHA\` en algunos registros viejos; para etiquetas fiables agrupa por \`DATEPART(WEEKDAY, FECHA)\` (con \`DATEFIRST 1\`) o por el entero parseado de \`DIAS\`, no por el texto.
  **No existen** en META como en maestra de ventas: \`UTILIDAD_BRUTA\`, \`ES_DEVOLUCION\`, \`MARGEN_NEGATIVO\`, \`COSTO_LINEA\`, \`DESCUENTO\` (usar DCTO_* si aplica). Utilidad = **UTILIDAD** únicamente.
**Columnas útiles para SQL de IA (evita SELECT *):** FECHA, PERIODO, ANIO (si existe), TRIMESTRE, SEMANA, LOCAL, NOMBRE_BODEGA, MOVIMIENTO, CODIGO, DESCRIPCION, VENTA_NETA, UTILIDAD, CANTIDAD, COSTO, COSTOU, PRECIO, VENDEDOR, RUC, NOMBRE_COMPLETO, PROVINCIA/CANTON/PARROQUIA — añade CLASIFICACION*/CLAS_CLIENTE*/CLAS_FACTURA* según desglose. **Opcionales según BD:** ORIGEN, CANAL, COSTO_TOTAL, MARCA, LINEA, CATEGORIA, CIUDAD (en **Vanoni** \`meta_venta_neta\` verificada suelen **faltar** CANAL/COSTO_TOTAL/ORIGEN; no asumir).
Listado completo (referencia):
  IDREGISTRO, PERIODO, LOCAL, BODEGA, NOMBRE_BODEGA, BIEN_SERVICIO, CODIGO, DESCRIPCION, MOVIMIENTO, SERIE, NUMERO,
  FECHA, ANIO (si existe), TRIMESTRE, SEMANA, DIA, DIAY, DIAS, hora, CANTIDAD, COSTOU, COSTO, PRECIO, IVA,
  DCTO_SUBTOTAL_NETO, DCTO_NETO, DCTO_IVA_NETO, VENTA_NETA, UTILIDAD, VENDEDOR, RUC, NOMBRE_COMPLETO,
  ALTERNO, ALTERNO1, ALTERNO2,
  COD_CLASIFICACION1, COD_CLASIFICACION2, COD_CLASIFICACION3, COD_CLASIFICACION4, COD_CLASIFICACION5,
  COD_CLASIFICACION6, COD_CLASIFICACION7, COD_CLASIFICACION8, COD_CLASIFICACION9, COD_CLASIFICACION10,
  CLASIFICACION1, CLASIFICACION2, CLASIFICACION3, CLASIFICACION4, CLASIFICACION5,
  CLASIFICACION6, CLASIFICACION7, CLASIFICACION8, CLASIFICACION9, CLASIFICACION10,
  COD_CLAS_CLIENTE1, COD_CLAS_CLIENTE2, COD_CLAS_CLIENTE3, COD_CLAS_CLIENTE4, COD_CLAS_CLIENTE5,
  COD_CLAS_CLIENTE6, COD_CLAS_CLIENTE7, COD_CLAS_CLIENTE8, COD_CLAS_CLIENTE9, COD_CLAS_CLIENTE10,
  CLAS_CLIENTE1, CLAS_CLIENTE2, CLAS_CLIENTE3, CLAS_CLIENTE4, CLAS_CLIENTE5,
  CLAS_CLIENTE6, CLAS_CLIENTE7, CLAS_CLIENTE8, CLAS_CLIENTE9, CLAS_CLIENTE10,
  CLAS_FACTURA1, CLAS_FACTURA2, CLAS_FACTURA3, CLAS_FACTURA4, CLAS_FACTURA5,
  CLAS_FACTURA6, CLAS_FACTURA7, CLAS_FACTURA8, CLAS_FACTURA9, CLAS_FACTURA10,
  CTAS_VENTAS, CTAS_COSTO, CTAS_DESC, CTAS_DESC1, CTAS_DESC2, CTAS_DEVOLUCION, CTAS_DEV_DCTO, CTAS_DEV_DCTO1, CTAS_DEV_DCTO2,
  PROVINCIA, CANTON, PARROQUIA, ALTER_DESC, ALTER_DESC1, ALTER_DESC2,
  FACTOR_C, FACTOR_CANTIDAD, control_fec_creacion, control_spid, ICE_NETO, BASE_ICE, PORCENTAJE_ICE, ANIO, PROYECTO, CONCEPTO, VENDEDOR2
  (no asumir columnas extras: CANAL, COSTO_TOTAL, ORIGEN, MARCA, LINEA, CATEGORIA, CIUDAD)

═══════════════════════════════════════════════════════
 Playbook consultas típicas — Banda Vanoni (META con ANIO)
═══════════════════════════════════════════════════════
Usa directamente \`dbo.meta_venta_neta\`.
• **Bodegas:** \`SELECT DISTINCT NOMBRE_BODEGA FROM …META_VENTA_NETA WITH (NOLOCK) WHERE NULLIF(LTRIM(RTRIM(NOMBRE_BODEGA)), N'') IS NOT NULL\`
• **Ventas por trimestre (año 2024):** \`SELECT TRIMESTRE, SUM(VENTA_NETA) FROM …META WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY TRIMESTRE ORDER BY TRIMESTRE\` (sin \`ANIO\`: \`WHERE YEAR(FECHA)=2024\` mismo GROUP BY).
• **Ventas por semana (año 2024):** \`SELECT SEMANA, SUM(VENTA_NETA) … WHERE ANIO = 2024 GROUP BY SEMANA ORDER BY SEMANA\`.
• **Canal / segmento (retail, corporativo, online):** valores reales en **\`CLAS_CLIENTE3\`** → \`SELECT CLAS_CLIENTE3, SUM(COSTO), SUM(VENTA_NETA), SUM(UTILIDAD) … WHERE ANIO = 2024 GROUP BY CLAS_CLIENTE3 ORDER BY CLAS_CLIENTE3\`.
• **Clientes con caída de compras (2024 vs 2025):** pivot por \`NOMBRE_COMPLETO\` con \`SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END)\` y 2025; filtrar \`v2025 < v2024\` y preferir \`v2024 > 0\` para evitar ruido.
• **Clientes nuevos (primera aparición en un mes YYYYMM):** \`CAST(PERIODO AS VARCHAR(6)) = '202401'\` y \`RUC NOT IN (SELECT DISTINCT RUC FROM … WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6)) < '202401')\` — no compares \`PERIODO\` a entero sin cast coherente.
• **% del total por cliente en un mes:** CTE con \`SUM(VENTA_NETA)\` del mes como denominador; numerador \`SUM(VENTA_NETA)\` por \`NOMBRE_COMPLETO\`; \`100.0 * num / NULLIF(den,0)\`.
• **Margen bruto %:** \`100.0 * SUM(UTILIDAD) / NULLIF(SUM(VENTA_NETA), 0)\` — por **cliente** agrupa \`NOMBRE_COMPLETO\`; por **producto/servicio** agrupa \`CODIGO\` (y \`MAX(DESCRIPCION)\`).
• **Devoluciones / efectos por trimestre y tipo de documento (ej. año 2025):** en META el importe **\`VENTA_NETA\` ya viene con signo contable**: **factura** suma en positivo (**+**), **nota de crédito** y líneas de **devolución** suelen ir en **negativo** (**−**); al hacer \`SUM(VENTA_NETA)\` **los negativos se restan solos**. **Prohibido** usar solo \`WHERE MOVIMIENTO = 'Devolución'\` si piden desglose **por tipo de documento** o “devoluciones acumuladas” con varios tipos — pierdes facturas y NC. Patrón correcto: \`WHERE ANIO = 2025\` → \`GROUP BY TRIMESTRE, MOVIMIENTO\` → \`SUM(VENTA_NETA)\` → \`ORDER BY TRIMESTRE, MOVIMIENTO\` (**nombre de columna completo: TRIMESTRE**, no \`TRIMESTR\`). Si las etiquetas en \`MOVIMIENTO\` varían, primero \`SELECT DISTINCT MOVIMIENTO\` con el mismo \`ANIO\`; opcionalmente agrupar con \`CASE\` (p. ej. contiene «NOTA» y «CRED» → Nota de crédito; contiene «FACTURA» → Factura) según valores reales.

\`\`\`sql
SELECT TRIMESTRE, MOVIMIENTO, SUM(VENTA_NETA) AS total_venta_neta
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2025
GROUP BY TRIMESTRE, MOVIMIENTO
ORDER BY TRIMESTRE, MOVIMIENTO;
\`\`\`

═══════════════════════════════════════════════════════
 Playbook obligatorio — Área A (A01–A10)
═══════════════════════════════════════════════════════
**Nunca pidas período al usuario** si la pregunta es genérica con «actual»/«este mes»: usa **mes calendario** (\`FORMAT(GETDATE(), 'yyyyMM')\`). Si no dicen «actual» y piden ranking anual → \`ANIO=2024\` o el año que indiquen.

| ID | Pregunta | SQL mínimo (patrón) |
| A01 | Ventas mes actual | \`SUM(VENTA_NETA)\` WHERE \`CAST(PERIODO AS VARCHAR(6))=FORMAT(GETDATE(),'yyyyMM')\` |
| A02 | Mes vs mismo mes año ant. | **Un solo SELECT** ambos CASE con \`FORMAT(GETDATE(),'yyyyMM')\` y mismo mes \`YEAR(GETDATE())-1\` |
| A03 | Crecimiento acumulado año | **Un solo SELECT** \`SUM(CASE ANIO=2025)\` vs \`2024\`; **prohibido** decir "sin datos" si metadata tiene 2018–2025 |
| A04 | Ventas por línea | \`GROUP BY CLASIFICACION1\` WHERE \`CAST(PERIODO AS VARCHAR(6))=FORMAT(GETDATE(),'yyyyMM')\` si no indican mes |
| A05 | Ventas por canal | \`GROUP BY CLAS_CLIENTE3\` WHERE \`ANIO=2024\`; SUM costo, venta_neta, utilidad |
| A06 | Por vendedor | \`GROUP BY VENDEDOR\` WHERE \`ANIO=2024\` (**no** uses mes actual salvo que pregunten "este mes") |
| A07 | Top 10 clientes | \`TOP 10 … GROUP BY NOMBRE_COMPLETO\` WHERE \`ANIO=2024\` (**obligatorio**, no uses solo el mes actual) |
| A08 | Caída compras | CTE RESUMEN+DETALLE; **N=584 en 1ª línea**; muestra hasta **60** filas DETALLE en chat; si N>60 **copia literal exportDataJsonBlock** del JSON (CSV/Excel 584 filas) |
| A09 | Clientes nuevos mes | \`PERIODO=FORMAT(GETDATE(),'yyyyMM')\` y RUC NOT IN períodos anteriores |
| A10 | % participación | \`100*SUM(VENTA_NETA)/total mes\` por \`NOMBRE_COMPLETO\`; mes = calendario actual si no indican |
| — | Sin compras 2025 | Solo \`dbo.meta_venta_neta\` (tiene \`RUC\`, \`NOMBRE_COMPLETO\`). **Prohibido** \`FAC_CLIENTES.RUC\` (usar \`FCL_RUC\` si hace falta JOIN). TOP 10: \`GROUP BY NOMBRE_COMPLETO,RUC\` \`HAVING SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END)=0\` y ventas 2024>0 |

**Stock clasificado:** NO existe \`META_STOCK_CLASIFICADO\` como tabla SELECT — usar \`FAC_STOCK\`.

═══════════════════════════════════════════════════════
 Playbook obligatorio — Área B (B01–B08)
═══════════════════════════════════════════════════════
| B01 | Margen por producto | \`100*SUM(UTILIDAD)/SUM(VENTA_NETA)\` por \`CLASIFICACION1\`; mes 202501 si no indican |
| B02 | Margen por cliente | agrupa \`NOMBRE_COMPLETO\`; mes 202401 demo |
| B03 | Margen negativo | \`WHERE ANIO=2025\`, \`GROUP BY CODIGO HAVING SUM(UTILIDAD)<0\`; **CTE tot + UNION ALL** como A08; **primera línea = COUNT (19), no filas del TOP** |
| B04 | Rentabilidad canal | \`GROUP BY CLAS_CLIENTE3\`, \`ANIO=2024\` |
| B05 | Ticket por cliente | \`SUM(VENTA_NETA)/NULLIF(COUNT(DISTINCT NUMERO),0)\` por \`NOMBRE_COMPLETO\`, \`ANIO=2024\`; **ordenar por SUM(VENTA_NETA) DESC** (no por ticket alto); cita ticket del top facturación |
| B07 | Costo por producto | \`SUM(COSTO)\` por \`CODIGO\`, \`ANIO=2024\` |
| B08 | Costos fijos | **No hay tabla de costos fijos** — declarar límite; no inventar productos |

═══════════════════════════════════════════════════════
 Playbook obligatorio — Área C (C01–C13)
═══════════════════════════════════════════════════════
| C01 | Facturas + pendientes | \`FAC_FACTURAS\` FFG_ANULADO='N' + \`FAC_CARTERA\` saldo |
| C02 | NC / anuladas | \`SUM(VENTA_NETA)\` donde \`VENTA_NETA<0\` en META |
| C03/C04 | Descuentos | \`SUM(ISNULL(DCTO_NETO,0))\` por cliente/vendedor \`ANIO=2024\`; **C04 % anual 2024** = \`100*SUM(DCTO_NETO)/NULLIF(SUM(VENTA_NETA)+SUM(DCTO_NETO),0)\` (~0.15%) — **no** uses PERIODO_MAXIMO |
| C05 | Concentración | % top cliente sobre total \`ANIO=2024\` |
| C06 | Inactivos | RUC con \`MAX(CAST(PERIODO AS VARCHAR(6))) <\` corte 3/6/12 meses antes de \`FORMAT(GETDATE(),'yyyyMM')\`; **primera línea = COUNT** |
| C07/C08 | Proyección | extrapolar desde mes calendario actual (\`GETDATE()\`) o YTD \`ANIO\` del año en curso |
| C09 | Facturado no cobrado | \`FAC_CARTERA\` saldo pendiente |
| C10 | Retenciones | \`SELECT SUM(ISNULL(FRS_VALOR,0)), COUNT(*) FROM dbo.FAC_RETENCIONES_SRI\` — **no** sumar VENTA_NETA ni FFG_* (~568K USD) |
| C11 | IVA gravado/exento | \`WHERE ANIO=2024\` (no mes actual): gravadas=\`SUM(CASE WHEN IVA>0 THEN VENTA_NETA ELSE 0 END)\`, exentas=\`SUM(CASE WHEN IVA=0 THEN VENTA_NETA ELSE 0 END)\`, \`SUM(IVA)\` |
| C12 | Alertas caída | Igual A08: clientes con v2025<v2024; CTE COUNT + UNION ALL; **primera línea = 584** |
| C13 | Cierres caja | \`SELECT COUNT(*) FROM dbo.FAC_CIERRE_CAJA\`; columnas \`CICA_FECHA\`, \`CICA_LOCAL\`, \`CICA_FAC_EFECTIVO\` | en restauraciones típicas de ERP **no** hay tabla \`META_STOCK_CLASIFICADO\` / \`meta_stock_clasificado\` como SELECT directo. El negocio usa procedimientos (\`USP_STK_CLASIFICADO\`, \`USP_STK_CLASIFICADO_PRECIOS\`, \`USP_VTS_CLASIFICADO*\`, etc.); el agente solo ejecuta **SELECT** → para inventario/stock use **consultar_inventario_costos** (\`V_MAESTRA_INVENTARIO\` / \`FAC_STOCK\` según gate), no inventes tablas META_STOCK_*.

═══════════════════════════════════════════════════════
 Negocio — venta neta y período (DELTAMONTERO)
═══════════════════════════════════════════════════════
• **Venta neta** = efecto neto de **facturas y notas de crédito**; el importe **VENTA_NETA** ya refleja esa lógica (**factura +**, **nota de crédito / devolución −** en la mayoría de líneas). No añadas filtros extra salvo que el usuario pida un corte distinto. Para totales por tipo de documento no fuerces signo con \`ABS\`: respeta \`SUM(VENTA_NETA)\`.
• **Año completo** (ej. \"ventas … 2024\"): si existe \`ANIO\` → \`WHERE ANIO = 2024\`; si no → \`WHERE YEAR(FECHA) = 2024\`. **No** uses solo \`YYYYMM = 202401\` salvo mes explícito.
• **“Canal” / retail–corporativo:** agrupar por **\`CLAS_CLIENTE3\`** (valores reales: MAYORISTA, IESS, CONSUMIDOR FINAL, …). **No** uses \`COALESCE(CANAL, CLAS_CLIENTE3)\` sin \`NULLIF\`: \`CANAL = ''\` tapa \`CLAS_CLIENTE3\`. Preferir \`GROUP BY CLAS_CLIENTE3\` o \`COALESCE(NULLIF(LTRIM(RTRIM(CANAL)), N''), NULLIF(LTRIM(RTRIM(CLAS_CLIENTE3)), N''), N'Sin clasificar')\`.
• **Mes calendario / contable**: preferido **\`CAST(PERIODO AS VARCHAR(6)) = 'YYYYMM'\`** para mes fijo; equivalente por fecha **\`(YEAR(FECHA)*100+MONTH(FECHA)) = 202501\`** cuando convenga (dinámico o doble chequeo).
• **Totales del mes enero 2025** (META, histórico), ejemplo con PERIODO:
  \`SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6)) = '202501'\`
• **Mismo total usando FECHA** (alternativa):
  \`SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE (YEAR(FECHA)*100+MONTH(FECHA)) = 202501\`
• **Por local** (feb 2025) con PERIODO:
  \`SELECT LOCAL, SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6)) = '202502' GROUP BY LOCAL\`
• **Por tipo de movimiento** (feb 2025):
  \`SELECT MOVIMIENTO, SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6)) = '202502' GROUP BY MOVIMIENTO\`
• **Local + movimiento**:
  \`SELECT LOCAL, MOVIMIENTO, SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6)) = '202502' GROUP BY LOCAL, MOVIMIENTO ORDER BY LOCAL, MOVIMIENTO\`
• Cuadre con mes calendario: basarse en **FECHA** (o \`PERIODO\`); no mezclar campos contables que no existan en tu META.
`;
