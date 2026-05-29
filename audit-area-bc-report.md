# Auditoría Áreas B y C

Generado: 2026-05-14T16:40:29.418Z

| Total | PASS | FAIL |
|---|---|---|
| 21 | 13 | 8 |

### B01 — ¿Margen bruto por producto o servicio?

**FAIL** — IA sin cifras extraíbles

```sql
SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202501'
GROUP BY CLASIFICACION1 ORDER BY SUM(VENTA_NETA) DESC
```

BD: `[{"margen":55.071935}]`

Encontré un total de 232 resultados. Aquí te muestro los primeros 60 resultados en pantalla:

| Índice | Código        | Descripción                                                                                                       | Total Ventas | Utilidad | Margen (%) |
|--------|---------------|------------------------------------------------------------------------------------------------------------------|--------------|----------|------------|
| 1      | 4000.001-6   | NOCOLYSE NEUTRAL (6X1L) BIODESINFECTANTE DE AREAS A BASE DE PEROXIDO DE HIDROGENO                               | 30,

---

### B02 — ¿Margen bruto por cliente?

**PASS** — ≈ 46.15 (r2)

```sql
SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202401'
GROUP BY NOMBRE_COMPLETO ORDER BY SUM(VENTA_NETA) DESC
```

BD: `[{"margen":45.587874}]`

Encontré un total de 679 resultados. Aquí te muestro 60 resultados en pantalla:

1. JUNTA DE BENEFICENCIA DE GUAYAQUIL: Total Ventas: **186,992.30 USD**, Utilidad: **86,305.12 USD**, Margen: **46.15%**
2. HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN: Total Ventas: **158,480.51 USD**, Utilidad: **73,788.28 USD**, Margen: **46.56%**
3. HOSPITAL DE ESPECIALIDADES GUAYAQUIL DR ABEL GILBERT PONTON: Total Ventas: **111,141.81 USD**, Utilidad: **39,412.77 USD**, Margen: **35.46%**
4. INNOVACION FASMED S.A.: Total Ventas: **100,248.81 USD**, Utilidad: **49,090.85 USD**, Margen: **48.97%**
5. HOSPIT

---

### B03 — ¿Productos con margen negativo?

**PASS** — ≈ 19

```sql
SELECT COUNT(*) AS n FROM (
  SELECT CODIGO FROM dbo.meta_venta_neta WITH (NOLOCK)
  WHERE ANIO=2025 GROUP BY CODIGO HAVING SUM(UTILIDAD)<0
) x
```

BD: `[{"n":19}]`

Encontré un total de 19 productos con margen negativo. Aquí te muestro los resultados:

1. **Código:** 103902085, **Utilidad:** -17.50
2. **Código:** 121610075, **Utilidad:** -19.68
3. **Código:** 103902060, **Utilidad:** -79.73
4. **Código:** 2271618-5, **Utilidad:** -24.38
5. **Código:** KMNTR-350100 M, **Utilidad:** -297.24
6. **Código:** 103902065, **Utilidad:** -12.66
7. **Código:** S2059, **Utilidad:** -2.26
8. **Código:** 8884717301, **Utilidad:** -46.36
9. **Código:** 1076, **Utilidad:** -1.92
10. **Código:** MAR.3, **Utilidad:** -0.23
11. **Código:** BM7.5X15, **Utilidad:** -0.33
12. 

---

### B04 — ¿Rentabilidad por canal de ventas?

**PASS** — ≈ 52.16

```sql
SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS margen
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=2024
GROUP BY CLAS_CLIENTE3 ORDER BY SUM(VENTA_NETA) DESC
```

BD: `[{"margen":51.346944}]`

Encontré un total de 11 resultados. Aquí te muestro los canales con su respectiva rentabilidad:

1. **-**: Venta Neta: **724.03** USD, Utilidad: **458.01** USD, Margen: **63.26%**
2. **COLABORADORES/ACC**: Venta Neta: **2,324.48** USD, Utilidad: **1,212.52** USD, Margen: **52.16%**
3. **CONSUMIDOR FINAL**: Venta Neta: **189,414.40** USD, Utilidad: **112,566.43** USD, Margen: **59.43%**
4. **HOSPITALES Y CLINICAS**: Venta Neta: **110,059.66** USD, Utilidad: **56,454.25** USD, Margen: **51.29%**
5. **IESS**: Venta Neta: **296,297.43** USD, Utilidad: **155,485.02** USD, Margen: **52.48%**
6. **JU

---

### B05 — ¿Ticket promedio por cliente?

**PASS** — límite declarado OK

```sql
SELECT TOP 5 NOMBRE_COMPLETO, SUM(VENTA_NETA)/NULLIF(COUNT(DISTINCT NUMERO),0) AS ticket
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2024
GROUP BY NOMBRE_COMPLETO ORDER BY SUM(VENTA_NETA) DESC
```

BD: `[{"NOMBRE_COMPLETO":"JUNTA DE BENEFICENCIA DE GUAYAQUIL","ticket":742.032936},{"NOMBRE_COMPLETO":"HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN","ticket":1633.81969},{"NOMBRE_COMPLETO":"HOSPITAL DE ESPECIALIDADES GUAYAQUIL DR ABEL GILBERT PONTON","ticket":18523.635},{"NOMBRE_COMPLETO":"INNOVACION FASMED S.A.","ticket":4773.752857},{"NOMBRE_COMPLETO":"HOSPITAL PEDIATRICO BACA ORTIZ","ticket":1285.66971}]`

Encontré un total de 139 resultados.

Aquí te muestro 60 resultados en pantalla:

| Índice | Nombre Completo                                             | Total Ventas | N° Facturas | Ticket Promedio |
|--------|-----------------------------------------------------------|--------------|-------------|------------------|
| 1      | CUASQUE GUALOTO ALEXANDRA                                 | 232.28       | 1           | 232.28           |
| 2      | DIRECCION NACIONAL DE ATENCION INTEGRAL EN SALUD PLANTA CENTRAL | 895.50       | 1           | 895.50           |
| 3      | DUARTE SANTANA JACKELINE

---

### B06 — ¿Ticket promedio por vendedor?

**PASS** — ≈ 1095.71 (r3)

```sql
SELECT TOP 1 VENDEDOR, SUM(VENTA_NETA)/NULLIF(COUNT(DISTINCT NUMERO),0) AS ticket
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=2024
GROUP BY VENDEDOR ORDER BY ticket DESC
```

BD: `[{"VENDEDOR":"ASESOR GYE 1","ticket":1095.714155}]`

Encontré un total de 5 resultados. Aquí te muestro los tickets promedio por vendedor:

1. VENDEDOR: ASESOR GYE 1, TICKET PROMEDIO: **$1095.71**
2. VENDEDOR: ASESOR UIO 1, TICKET PROMEDIO: **$1010.50**
3. VENDEDOR: ASESOR UIO 2, TICKET PROMEDIO: **$454.62**
4. VENDEDOR: OFICINA, TICKET PROMEDIO: **$365.44**
5. VENDEDOR: ASESOR GYE 2, TICKET PROMEDIO: **$192.56**

Si deseas más información o un análisis adicional, no dudes en decírmelo.

---

### B07 — ¿Costo de ventas asociado a cada producto?

**FAIL** — cercano 517 vs ref 32431.11114 (Δ 98.4%)

```sql
SELECT TOP 1 CODIGO, SUM(COSTO) AS costo
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=2024
GROUP BY CODIGO ORDER BY costo DESC
```

BD: `[{"CODIGO":"ZET.H021","costo":32431.11114}]`

Encontré un total de 517 resultados. Aquí te muestro 60 costos de ventas asociados a cada producto:

1. **Código:** GT023-200 14FR  
   **Descripción:** SISTEMA DE SUCCION CERRADA 14FR, MDI, PARA TUBO ENDOTRAQUEAL, CONEXION EN CODO  
   **Costo Total:** 43,835.82

2. **Código:** 4000.001-6  
   **Descripción:** NOCOLYSE NEUTRAL (6X1L) BIODESINFECTANTE DE AREAS A BASE DE PEROXIDO DE HIDROGENO  
   **Costo Total:** 19,149.06

3. **Código:** GT022-200 16FR  
   **Descripción:** SONDA FOLEY 16FR, 2 VIAS, BALON DE 5-15ML  
   **Costo Total:** 19,086.75

4. **Código:** GT022-200 14FR  
   **Descripc

---

### B08 — ¿Ventas que no cubren costos fijos?

**PASS** — límite declarado OK

```sql
(qualitativa)
```

BD: `[]`

Encontré un total de 2 resultados.

1. **Costo Fijo**: -13,938.70 USD
2. **Ventas Totales**: 114,921.26 USD

### Interpretación:
Las ventas totales superan los costos fijos, lo que indica que la operación está cubriendo estos costos y generando un margen positivo.

---

### C01 — ¿Facturas emitidas y pendientes de cobro?

**PASS** — multi parcial OK

```sql
SELECT
  (SELECT COUNT(*) FROM dbo.FAC_FACTURAS WITH (NOLOCK) WHERE FFG_ANULADO='N') AS facturas_emitidas,
  (SELECT SUM(FCC_VALOR-FCC_PAGADO) FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE FCC_VALOR-FCC_PAGADO>0) AS pendiente_cobro
```

BD: `[{"facturas_emitidas":26005,"pendiente_cobro":497499.27}]`

Encontré un total de 1 resultado.

**Facturas emitidas hoy:** Nose ha registrado ninguna factura emitida hoy.

**Cartera pendiente de cobro:** **$497,499.27**.

---

### C02 — ¿Ventas anuladas o notas de crédito del período?

**FAIL** — cercano -492804.55 vs ref 23589.48 (Δ 2189.1%)

```sql
SELECT SUM(VENTA_NETA) AS total_nc
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202508' AND VENTA_NETA<0
```

BD: `[{"total_nc":-23589.48}]`

Encontré un total de 413 notas de crédito o ventas anuladas, con un total de **-492,804.55 USD** en ventas.

Esto indica que las anulaciones tuvieron un impacto significativo en lasventas totales, mostrando la necesidad de un análisis sobre las razones de estas cancelaciones.

---

### C03 — ¿Descuentos otorgados por cliente o vendedor?

**FAIL** — cercano 60 vs ref 389.51 (Δ 84.6%)

```sql
SELECT TOP 1 NOMBRE_COMPLETO, SUM(ISNULL(DCTO_NETO,0)) AS descuento
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=2024
GROUP BY NOMBRE_COMPLETO ORDER BY descuento DESC
```

BD: `[{"NOMBRE_COMPLETO":"REDWOOD BARQUET TALIA ELECTRA","descuento":389.51}]`

### Descuentos por Cliente

Encontré un total de 60 resultados por cliente. Aquí te muestro 60 resultados en pantalla:

1. REDWOOD BARQUET TALIA ELECTRA: **USD 389.51**
2. AF ABASTECEDORA DE INSUMOS MEDICOS IMPORTACION Y EXPORTACION ABASMEIMEX SA: **USD 288.29**
3. PAUTA CORDOVA JORGE ENRIQUE: **USD 272.17**
4. HOSPITAL-METROPOLITANO S.A.S.: **USD 261.61**
5. LA CASA DEL MEDICO S.A.: **USD 137.60**
6. JIMENEZ SANCHEZ NOEMI DEL CARMEN: **USD 136.60**
7. MURILLO MONTECE EMILY CAMILA: **USD 117.46**
8. DROGUERIA KRONOS: **USD 115.84**
9. DAVIMED: **USD 98.38**
10. FARMAGO S A: **USD 85.80**
11. B

---

### C04 — ¿Descuentos promedio sobre ventas?

**FAIL** — cercano 14.76 vs ref 0.147592 (Δ 1461.2%)

```sql
SELECT 100.0*SUM(ISNULL(DCTO_NETO,0))/NULLIF(SUM(VENTA_NETA)+SUM(ISNULL(DCTO_NETO,0)),0) AS pct_descuento
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2024
```

BD: `[{"pct_descuento":0.147592}]`

El descuento promedio sobre ventas en 2024 es de **14.76%**.

---

### C05 — ¿Ventas concentradas en pocos clientes (riesgo)?

**PASS** — ≈ 9.6 (r2)

```sql
SELECT TOP 1 100.0*SUM(VENTA_NETA)/NULLIF((SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2024),0) AS concentracion
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO=2024
GROUP BY NOMBRE_COMPLETO ORDER BY concentracion DESC
```

BD: `[{"concentracion":9.596047}]`

Encontré un total de 681 resultados de clientes con sus respectivas ventas. Aquí te muestro 60 resultados en pantalla:

1. **JUNTA DE BENEFICENCIA DE GUAYAQUIL** (RUC: 0990967946001) - **Total ventas:** 186,992.30 USD - **Participación:** 9.60%
2. **HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN** (RUC: 1768046450001) - **Total ventas:** 158,480.51 USD - **Participación:** 8.13%
3. **HOSPITAL DE ESPECIALIDADES GUAYAQUIL DR ABEL GILBERT PONTON** (RUC: 0968503870001) - **Total ventas:** 111,141.81 USD - **Participación:** 5.70%
4. **INNOVACION FASMED S.A.** (RUC: 1792518415001) - **Total ventas

---

### C06 — ¿Clientes inactivos en los últimos 3/6/12 meses?

**FAIL** — multi {"inactivos_3m":1982,"inactivos_6m":1819}

```sql
SELECT
  (SELECT COUNT(*) FROM (SELECT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL GROUP BY RUC HAVING MAX(CAST(PERIODO AS VARCHAR(6))) < '202506') x) AS inactivos_3m,
  (SELECT COUNT(*) FROM (SELECT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL GROUP BY RUC HAVING MAX(CAST(PERIODO AS VARCHAR(6))) < '202503') x) AS inactivos_6m
```

BD: `[{"inactivos_3m":1982,"inactivos_6m":1819}]`

Encontré un total de 3 resultados.

Aquí te muestro la cantidad de clientes inactivos en los últimos períodos:

1. **3 meses**: 1,841
2. **6 meses**: 2,004
3. **12 meses**: 2,290

Estos datos reflejan la inactividad de los clientes en diferentes rangos temporales.

---

### C07 — ¿Proyección de ventas al cierre del mes?

**FAIL** — cercano 1144.09 vs ref 114921.26 (Δ 99.0%)

```sql
SELECT SUM(VENTA_NETA) AS ventas_mes_actual
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6))='202508'
```

BD: `[{"ventas_mes_actual":114921.26}]`

La proyección de ventas al cierre del mes indica un incremento del **1144.09%** respecto al total de ventas esperadas. Esto sugiere un desempeño sobresaliente en comparación con el objetivo establecido. 

Si necesitas más detalles o un desglose por segmentos, ¡házmelo saber!

---

### C08 — ¿Proyección de ventas al cierre del año?

**PASS** — ≈ 1318804.08 (r3)

```sql
SELECT SUM(VENTA_NETA) AS ytd
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2025
```

BD: `[{"ytd":1314804.08}]`

Para la proyección de ventas al cierre del año 2025, he realizado los cálculos necesarios. 

Hasta la fecha, las ventas acumuladas en 2024 fueron de **1,318,804.08 USD**, y las ventas totales hasta ahora en 2025 suman **1,948,638.74 USD**.

### Proyección
Si consideramos el promedio de ventas mensuales de 2024, la proyección de cierre para 2025 estima llegar a **3,267,442.32 USD** al final del año. 

Este análisis se basa en las tendencias actuales y la ejecución continua de ventas en línea con el desempeño de 2024. 

Si necesitas un desglose más detallado o algún otro indicador, házmelo saber

---

### C09 — ¿Ventas facturadas pero no cobradas?

**PASS** — ≈ 497499.27

```sql
SELECT SUM(FCC_VALOR-FCC_PAGADO) AS ventas_no_cobradas
FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE FCC_VALOR-FCC_PAGADO>0
```

BD: `[{"ventas_no_cobradas":497499.27}]`

Encontré un total de 1 resultado. El total de ventas facturadas pero no cobradas asciende a **$497,499.27**.

---

### C10 — ¿Ventas sujetas a retención?

**FAIL** — multi {"total_retenciones":568273.96,"n_registros":12089}

```sql
SELECT SUM(ISNULL(FRS_VALOR,0)) AS total_retenciones, COUNT(*) AS n_registros
FROM dbo.FAC_RETENCIONES_SRI WITH (NOLOCK)
```

BD: `[{"total_retenciones":568273.96,"n_registros":12089}]`

Encontré un total de 12,746 registros de ventas sujetas a retención, con un total acumulado de **1,949,257.83 USD** en ventas durante el año 2024.

---

### C11 — ¿Ventas gravadas y exentas de IVA?

**PASS** — multi parcial OK

```sql
SELECT
  SUM(CASE WHEN ISNULL(IVA,0)>0 THEN VENTA_NETA ELSE 0 END) AS gravadas,
  SUM(CASE WHEN ISNULL(IVA,0)=0 THEN VENTA_NETA ELSE 0 END) AS exentas,
  SUM(IVA) AS iva_total
FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2024
```

BD: `[{"gravadas":1949257.83,"exentas":-619.09,"iva_total":181734}]`

Aquí tienes el resumen de las ventas gravadas y exentas de IVA por año:

1. **Año 2023**:
   - **Ventas gravadas**: **1,949,257.83 USD**
   - **Ventas exentas**: **-619.09 USD**

2. **Año 2024**:
   - **Ventas gravadas**: **1,314,760.19 USD**
   - **Ventas exentas**: **43.89 USD**

3. **Año 2025**:
   - **Ventas gravadas**: **2,731,515.16 USD**
   - **Ventas exentas**: **3,088.57 USD**

Observamos un crecimiento significativo en las ventas gravadas en el transcurso de los años. Las ventas exentas presentan variaciones, pero en general, se encuentran en cifras marginales. Si necesitas más detal

---

### C12 — ¿Alertas de caída significativa de ventas?

**PASS** — ≈ 584

```sql
SELECT COUNT(*) AS alertas FROM (
  SELECT NOMBRE_COMPLETO FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY NOMBRE_COMPLETO
  HAVING SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) > 0
     AND SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END)
         < SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END)
) x
```

BD: `[{"alertas":584}]`

He encontrado un total de **584** clientes que han tenido una caída significativa en sus ventas de 2024 a 2025. Aquí te muestro **60** resultados en pantalla:

1. ERAZO SANTOS MARIUXI: 61.5
2. PAUTA CORDOVA JORGE ENRIQUE: 28727.75
3. OBANDO CRESPO MARIANA MARISOL: 41.5
4. GUAMAN PADILLA LUIS ALBERTO: 39.79
5. CAISAGUANO MANUEL: 39.79
6. MAYORGA GISSELA: 235.78
7. CASTRILLON JARAMILLO DUBERNEY: 441.57
8. OBREGON HELIANA: 253.67
9. NAULA LEYNES MARIA PILAR: 97.14
10. DELGADO KATHERIN: 153.5
11. VALLEJO DONOSO CRISTINA: 500
12. CHAVEZ RAQUEL: 30
13. ACOSTA TOMALA EVELYN JESENIA: 212.9
14. PIEDRA 

---

### C13 — ¿Dame un resumen de los cierres de caja?

**PASS** — ≈ 8012

```sql
SELECT COUNT(*) AS cierres FROM dbo.FAC_CIERRE_CAJA WITH (NOLOCK)
```

BD: `[{"cierres":8012}]`

Encontré un total de **8012 cierres** de caja. Aquí tienes un resumen de los montos:

- **Total efectivo:** **119,128.58 USD**
- **Total cheque:** **17,241.41 USD**
- **Total tarjeta:** **0.00 USD**
- **Total crédito:** **26,196,005.84 USD**

Si necesitas más detalles o un desglose completo, házmelo saber.

---

