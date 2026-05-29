/**
 * Mapa de fuentes y columnas verificadas contra ERP Banda Vanoni (restauración típica).
 * Objetivo: que el modelo sepa **dónde** consultar y **qué columnas** existen sin inventar.
 * Si tu despliegue difiere, regenerar contrastando INFORMATION_SCHEMA contra la BD conectada.
 */

export const BANDA_VANONI_IA_SCHEMA_MAP = `

═══════════════════════════════════════════════════════
 MAPA DE CONSULTAS — bandavanoni_new_2018_resp (única base)
═══════════════════════════════════════════════════════
Solo \`dbo.* WITH (NOLOCK)\` en bandavanoni_new_2018_resp. **Prohibido** [banda] y V_MAESTRA_*.

─── 1) Histórico ventas / márgenes / canal / clientes / tiempo ───
**Tabla:** \`dbo.meta_venta_neta\` (mismo rol lógico que **META_VENTA_NETA** en documentación).
**Skill:** \`consultar_comercial\` (SELECT sobre META calificada + vistas metadata del gate).

| Necesidad | Columnas / filtro típico |
|-----------|---------------------------|
| Año calendario | \`ANIO\` (int) o \`YEAR(FECHA)\` si \`ANIO\` no existiera en otra BD |
| Mes / período mensual | \`PERIODO\` = texto **\`YYYYMM'\`** (**6** dígitos; ej. enero 2025 **\`'202501'\`**, no \`'20251'\`). Preferir \`CAST(NULLIF(LTRIM(RTRIM(PERIODO)), N'') AS VARCHAR(6)) = 'YYYYMM'\` para mes fijo; \`(YEAR(FECHA)*100+MONTH(FECHA))\` válido para mes dinámico o equivalencia por fecha |
| Trimestre / semana | \`TRIMESTRE\`, \`SEMANA\` + \`WHERE ANIO = …\` |
| Día del mes / día del año | \`DIA\` (1–31, día del mes), \`DIAY\` (día del año; equivalente lógico a \`DATEPART(DAYOFYEAR, FECHA)\`) |
| Día de la semana (código 1–7) | Preferir \`SET DATEFIRST 1\` y \`DATEPART(WEEKDAY, FECHA)\`: **1=lunes … 7=domingo**. En \`DIAS\` el **primer token numérico** replica ese código; **no** usar como verdad la etiqueta en español tras el número (en históricos puede estar mal). |
| Local / punto de venta | \`LOCAL\` (varchar) |
| Bodega | \`BODEGA\` (decimal), \`NOMBRE_BODEGA\` (varchar) |
| Producto / servicio | \`CODIGO\`, \`DESCRIPCION\`, \`BIEN_SERVICIO\` |
| Línea documento | \`MOVIMIENTO\`, \`SERIE\`, \`NUMERO\`, \`FECHA\` |
| Cliente | \`RUC\`, \`NOMBRE_COMPLETO\` |
| Segmento “canal” | \`CLAS_CLIENTE3\` (texto; valores reales del ERP), \`COD_CLAS_CLIENTE3\` |
| Importes | \`VENTA_NETA\`, \`UTILIDAD\`, \`COSTO\`, \`COSTOU\`, \`PRECIO\`, \`CANTIDAD\`, descuentos \`DCTO_*\` |
| Territorio | \`PROVINCIA\`, \`CANTON\`, \`PARROQUIA\` |
| Clasificación producto | \`CLASIFICACION1\` … \`CLASIFICACION10\`, \`COD_CLASIFICACION1\` … |

**En esta línea de BD NO aparecen** (no uses en SQL; Msg 207): \`CANAL\`, \`COSTO_TOTAL\`, \`ORIGEN\`, \`MARCA\`, \`LINEA\`, \`CATEGORIA\`, \`CIUDAD\` en \`meta_venta_neta\`. Para “canal” comercial usar **\`CLAS_CLIENTE3\`**. Para costo de línea usar **\`COSTO\`** / **\`COSTOU\`**.

─── 2) Facturación hoy / documento cabecera (tiempo real) ───
**Tabla:** \`dbo.FAC_FACTURAS WITH (NOLOCK)\`.
**Obligatorio:** \`FFG_ANULADO = 'N'\`.
**Columnas frecuentes:** \`FFG_SERIE\`, \`FFG_NUMERO\` (PK lógica), \`FCL_CODIGO\`, \`FVE_CODIGO\`, \`FFG_FECHA\`, \`FFG_LOCAL\`, \`FFG_TOTAL\`, \`FFG_SUBTOTAL\`, \`FFG_IVA\`, \`FFG_RUC_CI\` (puede ser NULL; cliente maestro en \`FCL_CODIGO\`).

─── 3) Detalle de factura (líneas) ───
**Tabla:** \`dbo.FAC_FACTURA_DETALLE WITH (NOLOCK)\` — unir a cabecera con filtros no anulados (\`FFG_ANULADO\` vía JOIN a \`FAC_FACTURAS\`). Prefijos típicos: \`FFD_\`, \`FFG_SERIE\`, \`FFG_NUMERO\`, \`TBS_CODIGO\`.

─── 4) Maestro clientes ───
**Tabla:** \`dbo.FAC_CLIENTES WITH (NOLOCK)\`.
**PK / join:** \`FCL_CODIGO\` (decimal). **Nombre:** \`FCL_NOMBRE_COMPLETO\`, \`FCL_NOMBRE\`, **\`FCL_RUC\`** (NO existe columna \`RUC\` ni \`NOMBRE_COMPLETO\` en esta tabla — Msg 207).
**Contacto:** \`FCL_DIRECCION\`, \`FCL_CIUDAD\`, \`FCL_CREDITO\`, \`FCL_LIMITE\`, \`FCL_ACTIVO\`.
**Cruce con ventas históricas:** \`meta_venta_neta.RUC = FAC_CLIENTES.FCL_RUC\` o use solo META con \`RUC\` / \`NOMBRE_COMPLETO\`.

─── 5) Maestro productos ───
**Tabla:** \`dbo.FAC_BIEN_SERV WITH (NOLOCK)\`.
**PK:** \`TBS_CODIGO\` (varchar). **Texto:** \`TBS_DESCRIPCION\`. **Costos/precios:** \`TBS_COSTO_ACTUAL\`, \`TBS_COSTO_PROMEDIO\`, \`TBS_PRECIO1\`…\`TBS_PRECIO5\`, \`TBS_IVA\`, \`TBS_ACTIVO\`, \`TBS_TIPO\` (B/S).

─── 6) Stock por bodega (operativo) ───
**Tabla:** \`dbo.FAC_STOCK WITH (NOLOCK)\`.
**PK compuesta:** \`TBS_CODIGO\` + \`STK_BODEGA\` (int). **Cantidades/costos:** \`STK_ACTUAL\`, \`STK_MINIMO\`, \`STK_MAXIMO\`, \`STK_COSTO_ACTUAL\`, \`STK_INCIAL\`, \`STK_COSTO\`.

─── 7) Locales / establecimiento ───
**Tabla:** \`dbo.FAC_LOCALES WITH (NOLOCK)\`.
**PK:** \`LOC_NUMERO\` (int). \`LOC_NOMBRE\`, \`LOC_CIUDAD\`, \`LOC_ESTABLECIMIENTO\`, \`LOC_BODEGA\`.

─── 8) Stock “clasificado” por procedimiento ───
No hay tabla \`META_STOCK_CLASIFICADO\` estándar para SELECT. En ERP existen SPs (\`USP_STK_CLASIFICADO\`, \`USP_VTS_CLASIFICADO*\`, etc.); el agente **no ejecuta EXEC**. Para stock usar **consultar_inventario_costos** con \`dbo.FAC_STOCK\` + \`dbo.FAC_BIEN_SERV\` + \`dbo.FAC_LOCALES\`. Cruce ventas: \`dbo.meta_venta_neta\`.
`;
