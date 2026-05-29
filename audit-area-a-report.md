# Auditoría Área A — Clientes, ventas e ingresos

Generado: 2026-05-14T13:49:20.410Z

Base: **bandavanoni_new_2018_resp** | PERIODO_MAX: **202508** | ANIO_MAX: **2025**

## Resumen

| Métrica | Valor |
|---|---|
| Total | 10 |
| PASS | 10 |
| FAIL | 0 |

## SQL demostración (patrones usuario)

### META 2024
```sql
SELECT COUNT(*) AS filas FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024
```
Filas: 1 | Muestra: `[{"filas":12863}]`

### Bodegas
```sql
SELECT DISTINCT NOMBRE_BODEGA FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE NULLIF(LTRIM(RTRIM(NOMBRE_BODEGA)), N'') IS NOT NULL
```
Filas: 92 | Muestra: `[{"NOMBRE_BODEGA":"-"},{"NOMBRE_BODEGA":"BCHAP - Consignación Hospital Alfredo Paulson"},{"NOMBRE_BODEGA":"BCHCO - Bodega Consignación Hospital Conclina"}]`

### Trimestre 2024
```sql
SELECT TRIMESTRE, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY TRIMESTRE ORDER BY TRIMESTRE
```
Filas: 4 | Muestra: `[{"TRIMESTRE":1,"total":346354.18},{"TRIMESTRE":2,"total":548107.43},{"TRIMESTRE":3,"total":461256.85}]`

### Semana 2024
```sql
SELECT SEMANA, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY SEMANA ORDER BY SEMANA
```
Filas: 52 | Muestra: `[{"SEMANA":2,"total":33306.34},{"SEMANA":3,"total":48262.13},{"SEMANA":4,"total":26657.43}]`

### Canal 2024
```sql
SELECT CLAS_CLIENTE3, SUM(COSTO) AS costo, SUM(VENTA_NETA) AS venta, SUM(UTILIDAD) AS utilidad FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO = 2024 GROUP BY CLAS_CLIENTE3 ORDER BY CLAS_CLIENTE3
```
Filas: 11 | Muestra: `[{"CLAS_CLIENTE3":"-","costo":266.016012,"venta":724.03,"utilidad":458.01},{"CLAS_CLIENTE3":"COLABORADORES/ACC","costo":1111.997462,"venta":2324.48,"utilidad":1212.52},{"CLAS_CLIENTE3":"CONSUMIDOR FINAL","costo":76848.135597,"venta":189414.4,"utilidad":112566.43}]`

### Caída clientes pivot
```sql
SELECT TOP 5 NOMBRE_COMPLETO,
    SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) AS v2024,
    SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END) AS v2025
  FROM dbo.meta_venta_neta WITH (NOLOCK) GROUP BY NOMBRE_COMPLETO
```
Filas: 5 | Muestra: `[{"NOMBRE_COMPLETO":"BERMUDEZ DIAZ ROBERTO","v2024":0,"v2025":0},{"NOMBRE_COMPLETO":"GUAMAN MOROCHO CARLOS ALFREDO","v2024":9.9,"v2025":120.2},{"NOMBRE_COMPLETO":"DIAZ GONZALEZ BIBIANA","v2024":0,"v2025":0}]`

### Clientes nuevos 202401
```sql
SELECT COUNT(DISTINCT RUC) AS n FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE CAST(PERIODO AS VARCHAR(6))='202401' AND RUC IS NOT NULL
    AND RUC NOT IN (SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6))<'202401')
```
Filas: 1 | Muestra: `[{"n":21}]`

### Margen línea 202501
```sql
WITH base AS (SELECT * FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202501')
    SELECT TOP 1 CLASIFICACION1, SUM(VENTA_NETA) AS total FROM base GROUP BY CLASIFICACION1 ORDER BY total DESC
```
Filas: 1 | Muestra: `[{"CLASIFICACION1":"CHINA","total":230282.3}]`

### Ventas mensuales 2025
```sql
SELECT CAST(PERIODO AS VARCHAR(6)) AS mes, SUM(VENTA_NETA) AS total FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=2025 GROUP BY CAST(PERIODO AS VARCHAR(6)) ORDER BY mes
```
Filas: 8 | Muestra: `[{"mes":"202501","total":286687.95},{"mes":"202502","total":204349.55},{"mes":"202503","total":94431.18}]`

## Preguntas A01–A10

### A01 — ¿Cuáles son las ventas totales del mes actual?

**Estado:** PASS — ≈ 114921.26

**SQL referencia:**
```sql
SELECT SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202508'
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "total_ventas": 114921.26
  }
]
```

**Respuesta IA:**

Las ventas totales del mes actual son **$114,921.26**.

---

### A02 — ¿Cómo se comparan las ventas de este mes vs el mismo mes del año anterior?

**Estado:** PASS — multi OK

**SQL referencia:**
```sql
SELECT
  SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='202508' THEN VENTA_NETA ELSE 0 END) AS mes_actual,
  SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='202408' THEN VENTA_NETA ELSE 0 END) AS mismo_mes_anio_ant
FROM dbo.meta_venta_neta WITH (NOLOCK)
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "mes_actual": 114921.26,
    "mismo_mes_anio_ant": 165815.75
  }
]
```

**Respuesta IA:**

Las ventas del mes de mayo de 2025 fueron **114,921.26 USD**, mientras que en el mismo mes del año anterior, mayo de 2024, las ventas alcanzaron **165,815.75 USD**.

Esto indica una disminución en las ventas de este mes en comparación con el mismo mes del año anterior.

---

### A03 — ¿Cuál es el crecimiento acumulado de ventas en el año?

**Estado:** PASS — ≈ 1314804.08

**SQL referencia:**
```sql
SELECT
  SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END) AS ytd_actual,
  SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) AS ytd_anterior
FROM dbo.meta_venta_neta WITH (NOLOCK)
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "ytd_actual": 1314804.08,
    "ytd_anterior": 1948638.74
  }
]
```

**Respuesta IA:**

Encontré un total de **2 resultados** sobre el crecimiento acumulado de ventas.

1. **Año 2024:** **$1,948,638.74**
2. **Año 2025:** **$1,314,804.08**

En 2024, las ventas acumuladas fueron significativamente más altas en comparación con 2025, reflejando una disminución en los ingresos acumulados en el año actual. Si necesitas más detalles o análisis, házmelo saber.

---

### A04 — ¿Ventas por línea de producto en el período seleccionado?

**Estado:** PASS — ≈ 45463.44

**SQL referencia:**
```sql
SELECT TOP 1 CLASIFICACION1 AS linea, SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202508'
GROUP BY CLASIFICACION1
ORDER BY total_ventas DESC
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "linea": "CHINA",
    "total_ventas": 45463.44
  }
]
```

**Respuesta IA:**

Encontré un total de **11 resultados** para las ventas por línea de producto en el período **202508**. Aquí te muestro los resultados:

1. **CHINA**: **$45,463.44**
2. **FRANCIA**: **$34,985.91**
3. **MEXICO**: **$17,292.56**
4. **COLOMBIA**: **$10,248.91**
5. **ESTADOS UNIDOS**: **$5,458.63**
6. **-** : **$600.30**
7. **MALASIA**: **$360.60**
8. **BRASIL**: **$336.16**
9. **CANADA**: **$141.84**
10. **FINLANDIA**: **$32.91**
11.**ALEMANIA**: **$0.00**

Si deseas el listado completo o más detalles, por favor házmelo saber.

---

### A05 — ¿Ventas por canal (retail, corporativo, online)?

**Estado:** PASS — canal COLABORADORES/ACC OK

**SQL referencia:**
```sql
SELECT CLAS_CLIENTE3, SUM(COSTO) AS costo, SUM(VENTA_NETA) AS venta_neta, SUM(UTILIDAD) AS utilidad
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY CLAS_CLIENTE3
ORDER BY CLAS_CLIENTE3
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "CLAS_CLIENTE3": "-",
    "costo": 266.016012,
    "venta_neta": 724.03,
    "utilidad": 458.01
  },
  {
    "CLAS_CLIENTE3": "COLABORADORES/ACC",
    "costo": 1111.997462,
    "venta_neta": 2324.48,
    "utilidad": 1212.52
  },
  {
    "CLAS_CLIENTE3": "CONSUMIDOR FINAL",
    "costo": 76848.135597,
    "venta_neta": 189414.4,
    "utilidad": 112566.43
  },
  {
    "CLAS_CLIENTE3": "HOSPITALES Y CLINICAS",
    "costo": 53605.39165,
    "venta_neta": 110059.66,
    "utilidad": 56454.25
  },
  {
    "CLAS_CLIENTE3": "IESS",
    "costo": 140812.464908,
    "venta_neta": 296297.43,
    "utilidad": 155485.02
  },
  {
    "CLAS_CLIENTE3": "JUNTA",
    "costo": 100687.306883,
    "venta_neta": 186992.3,
    "utilidad": 86305.12
  },
  {
    "CLAS_CLIENTE3": "MAYORISTA",
    "costo": 370980.600654,
    "venta_neta": 762502.86,
    "utilidad": 391521.92
  },
  {
    "CLAS_CLIENTE3": "MINORISTA",
    "costo": 41266.065001,
    "venta_neta": 95540.26,
    "utilidad": 54274.11
  },
  {
    "CLAS_CLIENTE3": "MSP",
    "costo": 165171.61881,
    "venta_neta": 292968.94,
    "utilidad": 127797.31
  },
  {
    "CLAS_CLIENTE3": "OTROS",
    "costo": 2828.608596,
    "venta_neta": 7583.4,
    "utilidad": 4754.8
  }
]
```

**Respuesta IA:**

Encontré un total de 11 resultados. Aquí te muestro los datos sobre ventas por canal:

1. CLAS_CLIENTE3: -
   - **Total Venta:** $724.03
   - **Utilidad:** $458.01
2. CLAS_CLIENTE3: COLABORADORES/ACC
   - **Total Venta:** $2,324.48
   - **Utilidad:** $1,212.52
3. CLAS_CLIENTE3: CONSUMIDOR FINAL
   - **Total Venta:** $189,414.40
   - **Utilidad:** $112,566.43
4. CLAS_CLIENTE3: HOSPITALES Y CLINICAS
   - **Total Venta:** $110,059.66
   - **Utilidad:** $56,454.25
5. CLAS_CLIENTE3: IESS
   - **Total Venta:** $296,297.43
   - **Utilidad:** $155,485.02
6. CLAS_CLIENTE3: JUNTA
   - **Total Venta:** $

---

### A06 — ¿Ventas por vendedor o ejecutivo comercial?

**Estado:** PASS — ≈ 759329.91

**SQL referencia:**
```sql
SELECT TOP 10 VENDEDOR, SUM(VENTA_NETA) AS total_ventas
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY VENDEDOR
ORDER BY total_ventas DESC
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "VENDEDOR": "ASESOR GYE 1",
    "total_ventas": 759329.91
  },
  {
    "VENDEDOR": "ASESOR UIO 1",
    "total_ventas": 419356.83
  },
  {
    "VENDEDOR": "OFICINA",
    "total_ventas": 408562.56
  },
  {
    "VENDEDOR": "ASESOR UIO 2",
    "total_ventas": 330965.35
  },
  {
    "VENDEDOR": "ASESOR GYE 2",
    "total_ventas": 30424.09
  }
]
```

**Respuesta IA:**

Encontré un total de 5 resultados. Aquí te muestro los datos de ventas por vendedor:

1. **ASESOR GYE 1**: $759,329.91
2. **ASESOR UIO 1**: $419,356.83
3. **OFICINA**: $408,562.56
4. **ASESOR UIO 2**: $330,965.35
5. **ASESOR GYE 2**: $30,424.09

Estos son los resultados de ventas del año 2024 por cada vendedor. Si necesitas más información o un detalle específico, házmelo saber.

---

### A07 — ¿Top 10 clientes por facturación?

**Estado:** PASS — ≈ 186992.3

**SQL referencia:**
```sql
SELECT TOP 10 NOMBRE_COMPLETO, SUM(VENTA_NETA) AS total_facturacion
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE ANIO = 2024
GROUP BY NOMBRE_COMPLETO
ORDER BY total_facturacion DESC
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "NOMBRE_COMPLETO": "JUNTA DE BENEFICENCIA DE GUAYAQUIL",
    "total_facturacion": 186992.3
  },
  {
    "NOMBRE_COMPLETO": "HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN",
    "total_facturacion": 158480.51
  },
  {
    "NOMBRE_COMPLETO": "HOSPITAL DE ESPECIALIDADES GUAYAQUIL DR ABEL GILBERT PONTON",
    "total_facturacion": 111141.81
  },
  {
    "NOMBRE_COMPLETO": "INNOVACION FASMED S.A.",
    "total_facturacion": 100248.81
  },
  {
    "NOMBRE_COMPLETO": "HOSPITAL PEDIATRICO BACA ORTIZ",
    "total_facturacion": 88711.21
  },
  {
    "NOMBRE_COMPLETO": "AF ABASTECEDORA DE INSUMOS MEDICOS IMPORTACION Y EXPORTACION ABASMEIMEX SA",
    "total_facturacion": 80671.32
  },
  {
    "NOMBRE_COMPLETO": "HOSPITAL DE ESPECIALIDADES TEODORO MALDONADO CARBO",
    "total_facturacion": 58509.45
  },
  {
    "NOMBRE_COMPLETO": "ECUADOR OVERSEAS AGENCIES CA",
    "total_facturacion": 56494.42
  },
  {
    "NOMBRE_COMPLETO": "MEDIAVILLA GRANDA NANCY CECILIA",
    "total_facturacion": 52429.9
  },
  {
    "NOMBRE_COMPLETO": "HOSPITAL-METROPOLITANO S.A.S.",
    "total_facturacion": 46579.99
  }
]
```

**Respuesta IA:**

Encontré un total de 10 clientes que forman el top por facturación. Aquí te muestro los resultados:

1. JUNTA DE BENEFICENCIA DE GUAYAQUIL: **186,992.30 USD**
2. HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN: **158,480.51 USD**
3. HOSPITAL DE ESPECIALIDADES GUAYAQUIL DR ABEL GILBERT PONTON: **111,141.81 USD**
4. INNOVACION FASMED S.A.: **100,248.81 USD**
5. HOSPITAL PEDIATRICO BACA ORTIZ: **88,711.21 USD**
6. AF ABASTECEDORA DE INSUMOS MEDICOS IMPORTACION Y EXPORTACION ABASMEIMEX SA: **80,671.32 USD**
7. HOSPITAL DE ESPECIALIDADES TEODORO MALDONADO CARBO: **58,509.45 USD**
8. ECUADOR OVERSEA

---

### A08 — ¿Qué clientes han reducido sus compras respecto al período anterior?

**Estado:** PASS — ≈ 584

**SQL referencia:**
```sql
SELECT COUNT(*) AS clientes_en_caida FROM (
  SELECT NOMBRE_COMPLETO
  FROM dbo.meta_venta_neta WITH (NOLOCK)
  GROUP BY NOMBRE_COMPLETO
  HAVING SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END) > 0
     AND SUM(CASE WHEN ANIO=2025 THEN VENTA_NETA ELSE 0 END)
         < SUM(CASE WHEN ANIO=2024 THEN VENTA_NETA ELSE 0 END)
) x
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "clientes_en_caida": 584
  }
]
```

**Respuesta IA:**

Encontré un total de **584 resultados** que indican clientes que han reducido sus compras en el período 2025 respecto al 2024. Aquí te muestro solo **60 resultados** en pantalla:

1. TACURI TIGLLA MARIELA ALEXANDRA: 64.17 (2024) → 0 (2025)
2. BADILLO NARANJO VALERIA ANDREINA: 303.69 (2024) → 278.56 (2025)
3. CASTILLO QUINONES MARCOS XAVIER: 554.6 (2024) → 0 (2025)
4. REYES LEON GARY DANIEL: 161 (2024) → 115 (2025)
5. CARABALI MENDEZ YENNY JADIRA: 240 (2024) → 84.5 (2025)
6. LINO FIGUEROA ROSA SILVIA: 43.29 (2024) → 0 (2025)
7. ECHEVERRIA BARREIRO MERCEDES MATILDE: 10.4 (2024) → 0 (2025)
8. INS

---

### A09 — ¿Cuáles son los clientes nuevos del mes?

**Estado:** PASS — ≈ 20

**SQL referencia:**
```sql
SELECT COUNT(DISTINCT RUC) AS clientes_nuevos
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202508'
  AND RUC IS NOT NULL
  AND RUC NOT IN (
    SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6)) < '202508'
  )
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "clientes_nuevos": 20
  }
]
```

**Respuesta IA:**

Encontré un total de 20 clientes nuevos en el mes de agosto de 2025. Aquí te muestro los resultados:

1. **RUC:** 0502225147 - **Nombre:** ZAMBRANO BIFARINI JORGE IDAAC
2. **RUC:** 0650345234 - **Nombre:** CHACHA CHACHA MATEO SEBASTIAN
3. **RUC:** 0705417103 - **Nombre:** ALVARADO RAMOS DIANA
4. **RUC:** 0923705040 - **Nombre:** LLIGUIN LLIGUIN EDISON ROLANDO
5. **RUC:** 0927086744 - **Nombre:** ALEJANDRO ALEJANDRO BYRON ISAIAS
6. **RUC:** 0931703581 - **Nombre:** ESCOBAR SUAREZ ANA PAULA
7. **RUC:** 0993385036001 - **Nombre:** MACROSOLEC SAS
8. **RUC:** 1004107171 - **Nombre:** CUASQUE GUALOT

---

### A10 — ¿Cuánto representa cada cliente en el total de ventas (%)?

**Estado:** PASS — ≈ 29.09

**SQL referencia:**
```sql
SELECT TOP 1 NOMBRE_COMPLETO,
  100.0 * SUM(VENTA_NETA) / NULLIF((
    SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK)
    WHERE CAST(PERIODO AS VARCHAR(6)) = '202508'
  ), 0) AS porcentaje
FROM dbo.meta_venta_neta WITH (NOLOCK)
WHERE CAST(PERIODO AS VARCHAR(6)) = '202508'
GROUP BY NOMBRE_COMPLETO
ORDER BY porcentaje DESC
```

**Resultado BD (hasta 10 filas):**
```json
[
  {
    "NOMBRE_COMPLETO": "JUNTA DE BENEFICENCIA DE GUAYAQUIL",
    "porcentaje": 29.091092
  }
]
```

**Respuesta IA:**

Encontré un total de 139 resultados. Aquí te muestro 60 resultados en pantalla sobre la participación de cada cliente en el total de ventas:

1. JUNTA DE BENEFICENCIA DE GUAYAQUIL: **29.09%**
2. MEDICALCORPHV S.A.: **7.55%**
3. MEDIAVILLA GRANDA NANCY CECILIA: **7.31%**
4. HOSPITAL PEDIATRICO BACA ORTIZ: **6.32%**
5. SALUDCAREMEDICAL S.A.: **5.90%**
6. HOSPITAL DE ESPECIALIDADES TEODORO MALDONADO CARBO: **4.93%**
7. AF ABASTECEDORA DE INSUMOS MEDICOS IMPORTACION Y EXPORTACION ABASMEIMEX SA: **4.47%**
8. HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN: **4.29%**
9. INMEDCAS SAS SOCIEDAD DE BENE

---

