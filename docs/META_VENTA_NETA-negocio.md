# META_VENTA_NETA — definiciones de negocio (Delta Montero)

Documento generado a partir **solo** de las indicaciones del negocio. Sirve de referencia para consultas, IA y reportes.

---

## Documento de venta

| Concepto | Significado |
|----------|-------------|
| **NUMERO** | Número de factura. |
| **SERIE** | Secuencia (asociada al documento). |

---

## Tiempo y calendario

En muchos despliegues **no existen** las columnas **`ANIO`** / **`MES`** en `META_VENTA_NETA`. Para un **año calendario** usa siempre **`WHERE YEAR(FECHA) = 2024`** (o rango de `FECHA`). Si tu BD sí tiene `ANIO`, puedes usarla; si SQL devuelve *Invalid column name 'ANIO'*, cambia a **`YEAR(FECHA)`** o **`PERIODO`** (`LIKE '2024%'` para todo el año vía string YYYYMM, según tipo de dato).

| Campo | Significado |
|--------|-------------|
| **FECHA** | Fecha/hora del movimiento; base para análisis temporales. |
| **TRIMESTRE** | Trimestre (1–4). Ejemplo de uso: ventas por trimestre filtrando por año. |
| **SEMANA** | Semana del año. Ejemplo de uso: `SUM(VENTA_NETA)` por `SEMANA` para un año dado. |
| **DIA** | Día del **mes**. |
| **DIAY** | Día del **año** (1–366 según corresponda). |

---

## Importes y costos

| Campo / regla | Significado |
|---------------|-------------|
| **COSTOU** | Costo **unitario**. |
| **Negativo** | Valores negativos en importes representan **anulaciones**. |
| **DCTO_NETO** (*Dct_neto*) | Valor del **descuento neto**; debe presentarse **redondeado a dos decimales**. |
| **UTILIDAD** | **Utilidad = VENTA_NETA − COSTO** (costo alineado con la definición de costo de línea que uses en tu modelo). |

---

## Venta neta y análisis

- **VENTA_NETA** y **UTILIDAD** son métricas centrales para agregaciones (por trimestre, por semana, por vendedor, etc.).
- **Ventas por semana**: agrupar por **SEMANA** (y filtrar por año según tus consultas, p. ej. año 2024).

---

## Margen bruto (%) por producto o servicio

Con **UTILIDAD = VENTA_NETA − COSTO**, el **margen bruto sobre venta neta** agregado en un período es el cociente entre la **utilidad total** y la **venta neta total** del mismo corte, en porcentaje:

**100 × SUM(UTILIDAD) ÷ SUM(VENTA_NETA)**  
Si **SUM(VENTA_NETA) = 0**, devolver **0** (o `NULL`) para evitar división por cero — mismo criterio que en SSMS: `IIF(SUM(VENTA_NETA) = 0, 0, SUM(UTILIDAD) / SUM(VENTA_NETA) * 100)`.

**Por producto** (código + descripción; “servicio” vs “bien” puede distinguirse con **BIEN_SERVICIO** u otras columnas del modelo si aplica):

```sql
SELECT CODIGO,
       MAX(DESCRIPCION) AS DESCRIPCION,
       SUM(VENTA_NETA)  AS suma_venta_neta,
       SUM(UTILIDAD)    AS suma_utilidad,
       IIF(SUM(VENTA_NETA) = 0, 0,
           SUM(UTILIDAD) / SUM(VENTA_NETA) * 100.0) AS margen_bruto_pct
FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
WHERE (YEAR(FECHA)*100+MONTH(FECHA)) = 202401   -- o PERIODO / rango FECHA
GROUP BY CODIGO
ORDER BY margen_bruto_pct DESC;
```

**Notas:** Las **anulaciones** (importes negativos) entran en las sumas y pueden distorsionar el % en productos con poco volumen; si negocio lo pide, definir exclusiones o umbral mínimo de `SUM(VENTA_NETA)`. El mismo patrón por **cliente** es `GROUP BY NOMBRE_COMPLETO` (o **RUC**).

---

## Productos con margen negativo

**Definición:** Producto (línea de detalle) donde **la utilidad es negativa**, es decir **el costo supera la venta neta** en esa fila:

**UTILIDAD &lt; 0**  ⟺  **VENTA_NETA − COSTO &lt; 0**  ⟺  **COSTO &gt; VENTA_NETA**  
(respetando que los importes negativos pueden ser **anulaciones**; al agregar por producto conviene aclarar el período y si se excluyen anulaciones).

### Líneas con margen negativo en **META_VENTA_NETA** (detalle)

```sql
SELECT CODIGO, DESCRIPCION, FECHA, PERIODO,
       CANTIDAD, COSTOU, COSTO, VENTA_NETA, UTILIDAD
FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
WHERE UTILIDAD < 0
  AND YEAR(FECHA) = 2024
ORDER BY UTILIDAD ASC;
```

### Agregado por producto (suma de utilidad negativa en el período)

```sql
SELECT CODIGO, MAX(DESCRIPCION) AS DESCRIPCION,
       SUM(VENTA_NETA) AS suma_venta_neta,
       SUM(COSTO)     AS suma_costo,
       SUM(UTILIDAD)  AS suma_utilidad
FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
WHERE YEAR(FECHA) = 2024
GROUP BY CODIGO
HAVING SUM(UTILIDAD) < 0
ORDER BY SUM(UTILIDAD) ASC;
```

### Vista maestra **V_MAESTRA_VENTAS** (si se usa en la IA)

Ahí existe el flag **MARGEN_NEGATIVO** y la columna **UTILIDAD_BRUTA** por línea; para “margen negativo” en maestra se puede filtrar por **MARGEN_NEGATIVO = 1** o **UTILIDAD_BRUTA &lt; 0**, según el análisis (no mezclar nombres de columnas de META con los de la maestra).

---

## Códigos alternos (producto)

- No son el código **principal** del producto.
- **ALTERNO** (y variantes que defina el modelo) pueden usarse como referencia secundaria.

---

## Clasificaciones de producto (hasta 10)

Identificación adicional al producto:

| Nivel | Uso indicado |
|-------|----------------|
| **1** | Origen |
| **2** | Grupo |
| **3 … 10** | Clasificaciones adicionales según el modelo de datos (hasta 10 clasificaciones). |

---

## Cliente

| Tema | Significado |
|------|-------------|
| **Códigos de cliente** | Identificación del cliente en el modelo. |
| **CLAS_CLIENTE** (*Clas_cliente*) | Relacionado con **lugar / ubicación** del cliente. |
| **Tipo de cliente** | Parte **económica** / categoría económica del cliente. |

### Participación de cada cliente en el total de ventas (%)

**Definición:** para un mismo período (p. ej. **`PERIODO = 202401`** o **`YEAR(FECHA)=2024` / YYYYMM sobre `FECHA`**), la participación de un cliente es:

**100 × SUM(VENTA_NETA) del cliente ÷ SUM(VENTA_NETA) de todas las líneas del período**  
(agrupando por **`NOMBRE_COMPLETO`**; si hay homónimos, usar también **`RUC`** en el `GROUP BY`). Los **negativos** en `VENTA_NETA` entran en la suma (anulaciones); si negocio pide “% solo sobre ventas positivas”, hay que definir ese filtro aparte.

**Patrón SSMS (subconsulta al total):**

```sql
SELECT *
FROM (
  SELECT NOMBRE_COMPLETO,
         SUM(VENTA_NETA)
           / NULLIF((SELECT SUM(VENTA_NETA)
                     FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
                     WHERE PERIODO = 202401), 0)
           * 100.0 AS porcentaje
  FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
  WHERE PERIODO = 202401
  GROUP BY NOMBRE_COMPLETO
) d
ORDER BY porcentaje DESC;
```

**Variante con ventana (un solo barrido sobre agregados):**

```sql
WITH por_cliente AS (
  SELECT NOMBRE_COMPLETO, SUM(VENTA_NETA) AS venta_cliente
  FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
  WHERE PERIODO = 202401
  GROUP BY NOMBRE_COMPLETO
)
SELECT NOMBRE_COMPLETO,
       venta_cliente,
       CAST(venta_cliente * 100.0 / NULLIF(SUM(venta_cliente) OVER (), 0) AS DECIMAL(18, 4)) AS porcentaje
FROM por_cliente
ORDER BY porcentaje DESC;
```

---

## Ventas por “canal” (retail, corporativo, online)

En **META_VENTA_NETA** **no** hay columnas con los textos exactos *retail*, *corporativo* u *online*. Para un corte parecido a “canal / tipo de negocio” se usa la **clasificación económica del cliente**; en tus consultas en SSMS aparece **`CLAS_CLIENTE3`** como eje de agrupación (ej.: `GROUP BY CLAS_CLIENTE3` con `SUM(VENTA_NETA)`, `SUM(COSTO)`, `SUM(UTILIDAD)` y filtro por año).

### Valores observados en `CLAS_CLIENTE3` (ejemplo año 2024)

| Valor en BD | Lectura típica (orientativa) |
|---------------|------------------------------|
| **CONSUMIDOR FINAL**, **MINORISTA** | Perfil tipo **retail** / B2C |
| **MAYORISTA**, **HOSPITALES Y CLINICAS**, **IESS**, **MSP**, **JUNTA**, **SOLCA**, **COLABORADORES/ACC** | Perfil **institucional / corporativo / B2B** |
| **OTROS** | Resto; puede incluir casos varios |
| **-** (guión) | Sin clasificación en ese campo (tratar como categoría explícita o “sin dato”) |

**Online:** en esa lista **no** aparece un valor explícito “online”; puede estar en **OTROS**, en otra **`CLAS_CLIENTE1`…`CLAS_CLIENTE10`**, o en **CANAL** si el ERP lo alimenta. Conviene revisar `DISTINCT` sobre esas columnas antes de fijar reglas.

### SQL de referencia (mismo patrón que en SSMS)

```sql
SELECT CLAS_CLIENTE3,
       SUM(COSTO)       AS suma_costo,
       SUM(VENTA_NETA) AS suma_venta_neta,
       SUM(UTILIDAD)   AS suma_utilidad
FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
WHERE YEAR(FECHA) = 2024
GROUP BY CLAS_CLIENTE3
ORDER BY CLAS_CLIENTE3;
```

Para **mensual por calendario**, alternar o combinar con el filtro por **`FECHA`** (`YEAR(FECHA)*100+MONTH(FECHA)`) según la regla de negocio que quieras alinear con la maestra.

### Errores frecuentes (IA / chat)

1. **“2024” no es “enero 2024”.** Si el usuario pide *ventas por canal … 2024* (solo el año), el filtro debe ser **`YEAR(FECHA) = 2024`** (portable; muchas BDs **no** tienen columna **`ANIO`** en META). No uses `(YEAR(FECHA)*100+MONTH(FECHA)) = 202401` salvo que pida enero o un YYYYMM.
2. **`COALESCE(CANAL, CLAS_CLIENTE3)` da mal.** En SQL Server, **`CANAL = ''` (cadena vacía) no es NULL**; `COALESCE` devuelve `''` y **nunca llega a `CLAS_CLIENTE3`**, dejando todo como un solo bucket (“sin clasificar” en la respuesta). Usar:
   `COALESCE(NULLIF(LTRIM(RTRIM(CANAL)), N''), NULLIF(LTRIM(RTRIM(CLAS_CLIENTE3)), N''), N'Sin clasificar')`  
   o, para alinear con SSMS, **`GROUP BY CLAS_CLIENTE3`** directamente cuando la pregunta sea segmento económico / “canal”.

---

## Clientes que redujeron compras (ej. 2024 vs 2025)

**Pregunta de negocio:** ¿Qué clientes bajaron su **VENTA_NETA** agregada respecto al año anterior?

**Base:** pivotar por **año de `FECHA`** con `SUM(IIF(YEAR(FECHA) = …, VENTA_NETA, 0))` y agrupar por cliente (si tu tabla tiene **`ANIO`** y prefieres SSMS con año contable, úsalo solo donde exista la columna). **`NOMBRE_COMPLETO`**; homónimos → **`RUC`** en el `GROUP BY`.

### Solo clientes con caída (2025 &lt; 2024)

```sql
WITH agg AS (
  SELECT
    NOMBRE_COMPLETO,
    SUM(IIF(YEAR(FECHA) = 2024, VENTA_NETA, 0)) AS venta_2024,
    SUM(IIF(YEAR(FECHA) = 2025, VENTA_NETA, 0)) AS venta_2025
  FROM GestionBI.dbo.META_VENTA_NETA WITH (NOLOCK)
  WHERE YEAR(FECHA) IN (2024, 2025)
  GROUP BY NOMBRE_COMPLETO
)
SELECT
  NOMBRE_COMPLETO,
  venta_2024,
  venta_2025,
  venta_2025 - venta_2024 AS variacion_absoluta,
  CASE
    WHEN venta_2024 <> 0
    THEN CAST((venta_2025 - venta_2024) / NULLIF(venta_2024, 0) * 100 AS DECIMAL(12, 2))
  END AS variacion_pct
FROM agg
WHERE venta_2025 < venta_2024
ORDER BY variacion_absoluta ASC;  -- caída más fuerte primero
```

**Notas:** Incluye clientes que en 2025 pasan a **0** (dejaron de comprar) si en 2024 tenían venta &gt; 0. Si quieres excluir “bajas irrelevantes”, añade `AND venta_2024 >= @umbral`. Los **negativos** en `VENTA_NETA` son **anulaciones** según reglas de negocio documentadas arriba.

---

## Resumen en una frase

**Documento:** NUMERO = factura, SERIE = secuencia. **Tiempo:** FECHA, TRIMESTRE, SEMANA, DIA = día del mes, DIAY = día del año. **Economía:** COSTOU = costo unitario; negativos = anulaciones; DCTO_NETO redondeado a 2 decimales; UTILIDAD = VENTA_NETA − COSTO. **Producto:** códigos alternos secundarios; hasta 10 clasificaciones (1 = origen, 2 = grupo). **Cliente:** códigos, clasificación de cliente = ubicación, tipo de cliente = dimensión económica. **“Canal” retail/corporativo/online:** no hay columna homónima; usar **`CLAS_CLIENTE3`** (y otras `CLAS_CLIENTE*` o `CANAL` si aplica) con los valores reales de la BD. **Margen negativo:** **UTILIDAD &lt; 0** (META) o costo &gt; venta neta en la línea. **% sobre total de ventas por cliente:** suma de **VENTA_NETA** del cliente entre total del período × 100. **Margen bruto % (producto o cliente):** 100 × **SUM(UTILIDAD)** ÷ **SUM(VENTA_NETA)** con protección si el denominador es 0.

---

*Última actualización: negocio / usuario; SSMS, margen negativo, % participación y margen bruto %.*
