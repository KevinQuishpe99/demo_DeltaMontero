# DELTAMONTERO PROYECTO IA — Catálogo de preguntas

Columna **Prueba**: `1` = pasó heurística automática, `0` = falló. Columna **Detalle**: en fallos, motivo y extracto de lo que respondió la API.  
Actualizar con: `npm run test:preguntas-todas -- --update-md` (con `npm run dev` y API accesible).

---

## Área comercial — A. Clientes, ventas e ingresos


| ID  | Pregunta                                                                   | Prueba | Detalle                                                                               |
| --- | -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| A01 | ¿Cuáles son las ventas totales del mes actual?                             | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A02 | ¿Cómo se comparan las ventas de este mes vs el mismo mes del año anterior? | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A03 | ¿Cuál es el crecimiento acumulado de ventas en el año?                     | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A04 | ¿Ventas por línea de producto en el período seleccionado?                  | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A05 | ¿Ventas por canal (retail, corporativo, online)?                           | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A06 | ¿Ventas por vendedor o ejecutivo comercial?                                | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A07 | ¿Top 10 clientes por facturación?                                          | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A08 | ¿Qué clientes han reducido sus compras respecto al período anterior?       | 1      | audit-area-a PASS 2026-05-14 (COUNT 584)                                                     |
| A09 | ¿Cuáles son los clientes nuevos del mes?                                   | 1      | audit-area-a PASS 2026-05-14                                                                 |
| A10 | ¿Cuánto representa cada cliente en el total de ventas (%)?                 | 1      | audit-area-a PASS 2026-05-14                                                                 |


## Área comercial — B. Rentabilidad


| ID  | Pregunta                                   | Prueba | Detalle |
| --- | ------------------------------------------ | ------ | ------- |
| B01 | ¿Margen bruto por producto o servicio?     | 1      | audit-area-bc PASS |
| B02 | ¿Margen bruto por cliente?                 | 1      | audit-area-bc PASS |
| B03 | ¿Productos con margen negativo?            | 1      | audit-area-bc PASS (19 códigos) |
| B04 | ¿Rentabilidad por canal de ventas?         | 1      | audit-area-bc PASS |
| B05 | ¿Ticket promedio por cliente?              | 1      | listado ticket promedio OK (cifras varían por fórmula) |
| B06 | *¿Ticket promedio por vendedor?*           | 1      | audit-area-bc PASS |
| B07 | ¿Costo de ventas asociado a cada producto? | 1      | audit-area-bc PASS |
| B08 | ¿Ventas que no cubren costos fijos?        | 1      | límite declarado OK |


## Área comercial — C. Gestión comercial


| ID  | Pregunta                                         | Prueba | Detalle |
| --- | ------------------------------------------------ | ------ | ------- |
| C01 | ¿Facturas emitidas y pendientes de cobro?        | 1      | audit-area-bc PASS (cartera) |
| C02 | ¿Ventas anuladas o notas de crédito del período? | 1      | audit-area-bc PASS período 202508 |
| C03 | ¿Descuentos otorgados por cliente o vendedor?    | 0      | pendiente alinear DCTO_NETO |
| C04 | ¿Descuentos promedio sobre ventas?               | 0      | requiere ANIO=2024 (~0.15%) |
| C05 | ¿Ventas concentradas en pocos clientes (riesgo)? | 1      | audit-area-bc PASS |
| C06 | ¿Clientes inactivos en los últimos 3/6/12 meses? | 1      | audit-area-bc PASS 3/6/12m |
| C07 | ¿Proyección de ventas al cierre del mes?         | 1      | audit-area-bc PASS |
| C08 | ¿Proyección de ventas al cierre del año?         | 1      | audit-area-bc PASS YTD |
| C09 | ¿Ventas facturadas pero no cobradas?             | 1      | audit-area-bc PASS |
| C10 | ¿Ventas sujetas a retención?                     | 1      | audit-area-bc PASS FRS_VALOR |
| C11 | ¿Ventas gravadas y exentas de IVA?               | 1      | audit-area-bc PASS ANIO=2024 |
| C12 | ¿Alertas de caída significativa de ventas?       | 1      | audit-area-bc ~584 clientes |
| C13 | ¿Dame un resumen de los cierres de caja?         | 1      | audit-area-bc PASS 8012 |


## Crédito — D. Cuentas por cobrar


| ID  | Pregunta                                          | Prueba | Detalle                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | ¿Cuentas por cobrar totales?                      | 1      |                                                                                                                                                                                                                                                |
| D02 | ¿Antigüedad de cartera (0–30, 31–60, 61–90, +90)? | 1      |                                                                                                                                                                                                                                                |
| D03 | ¿Clientes con cartera vencida?                    | 1      |                                                                                                                                                                                                                                                |
| D04 | ¿Top clientes morosos?                            | 1      |                                                                                                                                                                                                                                                |
| D05 | ¿Cobros realizados en el período?                 | 1      |                                                                                                                                                                                                                                                |
| D06 | ¿Cobros proyectados próximos 30 días?             | 1      |                                                                                                                                                                                                                                                |
| D07 | ¿Facturas próximas a vencer?                      | 0      | frase bloqueada — No se pudo acceder a la información de facturas próximas a vencer debido a un error en la consulta SQL: **Error:** "Invalid column name 'FECHA_VENCE'." En cuanto a las ventas de enero de 2026, aquí tienes el detalle: ### |
| D08 | ¿Índice de rotación de cartera?                   | 1      |                                                                                                                                                                                                                                                |
| D09 | ¿Días promedio de cobro (DSO)?                    | 1      |                                                                                                                                                                                                                                                |
| D10 | ¿Riesgo de incobrabilidad por cliente?            | 1      |                                                                                                                                                                                                                                                |


## Cuentas por pagar — E. Cuentas por pagar


| ID  | Pregunta                                  | Prueba | Detalle |
| --- | ----------------------------------------- | ------ | ------- |
| E01 | ¿Cuentas por pagar totales?               | 1      |         |
| E02 | ¿Proveedores pendientes de pago?          | 1      |         |
| E03 | ¿Pagos programados próximos 7/15/30 días? | 1      |         |
| E04 | ¿Antigüedad de cuentas por pagar?         | 1      |         |
| E05 | ¿Proveedores críticos por monto?          | 1      |         |
| E06 | ¿Pagos vencidos?                          | 1      |         |
| E07 | ¿Pagos recurrentes mensuales?             | 1      |         |
| E08 | ¿Impacto en caja de pagos futuros?        | 1      |         |
| E09 | ¿Capacidad de pago a corto plazo?         | 1      |         |
| E10 | ¿Alertas de estrés de liquidez?           | 1      |         |


## Inventarios — F. Existencias


| ID  | Pregunta                                                  | Prueba | Detalle |
| --- | --------------------------------------------------------- | ------ | ------- |
| F01 | ¿Stock disponible por producto hoy?                       | 1      |         |
| F02 | ¿Stock por bodega o ubicación?                            | 1      |         |
| F03 | ¿Inventario total valorizado al costo?                    | 1      |         |
| F04 | ¿Inventario valorizado a precio de venta?                 | 1      |         |
| F05 | ¿Productos con stock bajo el mínimo?                      | 1      |         |
| F06 | ¿Productos con sobrestock?                                | 1      |         |
| F07 | ¿Unidades ingresadas y salidas en el período?             | 1      |         |
| F08 | ¿Inventario comprometido (ventas pendientes de despacho)? | 1      |         |
| F09 | ¿Inventario disponible real?                              | 1      |         |
| F10 | ¿Variación de inventario vs mes anterior?                 | 1      |         |


## Inventarios — G. Costos y valoración


| ID  | Pregunta                                         | Prueba | Detalle |
| --- | ------------------------------------------------ | ------ | ------- |
| G01 | ¿Costo promedio por producto?                    | 1      |         |
| G02 | ¿Costo última compra?                            | 1      |         |
| G03 | ¿Variación del costo de inventarios?             | 1      |         |
| G04 | ¿Productos con mayor impacto en el costo total?  | 1      |         |
| G05 | ¿Diferencias entre inventario físico y contable? | 1      |         |
| G06 | ¿Ajustes de inventario realizados en el período? | 1      |         |
| G07 | ¿Inventario afectado por mermas o pérdidas?      | 1      |         |
| G08 | ¿Valor de inventario deteriorado u obsoleto?     | 1      |         |
| G09 | ¿Inventario provisionado contablemente?          | 1      |         |
| G10 | ¿Impacto del inventario en el costo de ventas?   | 1      |         |


## Inventarios — H. Rotación y eficiencia


| ID  | Pregunta                                    | Prueba | Detalle                                                                               |
| --- | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| H01 | ¿Rotación de inventarios por producto?      | 0      | HTTP 0 — timeout 180000ms                                                             |
| H02 | ¿Días promedio de inventario (DIO)?         | 1      |                                                                                       |
| H03 | ¿Productos de alta rotación?                | 1      |                                                                                       |
| H04 | ¿Productos de baja rotación?                | 1      |                                                                                       |
| H05 | ¿Inventario inmovilizado (+90 / +180 días)? | 0      | HTTP 404 — <link rel="stylesheet" href="/_next/static/css/app/layout.css?v=1776365911 |
| H06 | ¿Productos sin movimiento en el período?    | 1      |                                                                                       |
| H07 | ¿Relación inventario vs ventas?             | 1      |                                                                                       |
| H08 | ¿Nivel óptimo de inventario estimado?       | 1      |                                                                                       |
| H09 | ¿Riesgo de quiebre de stock próximo?        | 1      |                                                                                       |
| H10 | ¿Recomendación automática de reposición?    | 1      |                                                                                       |


## Tesorería — I. Caja y bancos


| ID  | Pregunta                                     | Prueba | Detalle                                                                               |
| --- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| I01 | ¿Saldo disponible en bancos hoy?             | 1      |                                                                                       |
| I02 | ¿Saldo por cada cuenta bancaria?             | 1      |                                                                                       |
| I03 | ¿Saldo en caja chica?                        | 0      | HTTP 404 — <link rel="stylesheet" href="/_next/static/css/app/layout.css?v=1776366209 |
| I04 | ¿Conciliaciones bancarias pendientes?        | 1      |                                                                                       |
| I05 | ¿Movimientos bancarios del día/semana/mes?   | 1      |                                                                                       |
| I06 | ¿Ingresos y egresos del período?             | 0      | HTTP 500 — <meta name="viewport" conten                                               |
| I07 | ¿Flujo neto de efectivo del mes?             | 0      | HTTP 500 — <meta name="viewport" conten                                               |
| I08 | ¿Variación de caja respecto al mes anterior? | 0      | HTTP 500 — <meta name="viewport" conten                                               |
| I09 | ¿Ingresos no identificados en bancos?        | 0      | HTTP 500 — <meta name="viewport" conten                                               |
| I10 | ¿Pagos realizados hoy?                       | 0      | HTTP 500 — <meta name="viewport" conten                                               |


## Estados financieros — J. Estado de resultados


| ID  | Pregunta                                    | Prueba | Detalle                                 |
| --- | ------------------------------------------- | ------ | --------------------------------------- |
| J01 | ¿Utilidad o pérdida del mes?                | 0      | HTTP 500 — <meta name="viewport" conten |
| J02 | ¿Utilidad acumulada del año?                | 0      | HTTP 500 — <meta name="viewport" conten |
| J03 | ¿Comparativo de resultados vs presupuesto?  | 0      | HTTP 500 — <meta name="viewport" conten |
| J04 | ¿Variación de ingresos vs período anterior? | 0      | HTTP 500 — <meta name="viewport" conten |
| J05 | ¿Variación de costos vs período anterior?   | 0      | HTTP 500 — <meta name="viewport" conten |
| J06 | ¿Gastos administrativos del mes?            | 0      | HTTP 500 — <meta name="viewport" conten |
| J07 | ¿Gastos no deducibles identificados?        | 0      | HTTP 500 — <meta name="viewport" conten |
| J08 | ¿Resultado operativo (EBIT)?                | 0      | HTTP 500 — <meta name="viewport" conten |
| J09 | ¿Margen operativo?                          | 0      | HTTP 500 — <meta name="viewport" conten |
| J10 | ¿Margen neto?                               | 0      | HTTP 500 — <meta name="viewport" conten |


## Estados financieros — K. Balance general


| ID  | Pregunta                                 | Prueba | Detalle                                 |
| --- | ---------------------------------------- | ------ | --------------------------------------- |
| K01 | ¿Total de activos, pasivos y patrimonio? | 0      | HTTP 500 — <meta name="viewport" conten |
| K02 | ¿Composición del activo corriente?       | 0      | HTTP 500 — <meta name="viewport" conten |
| K03 | ¿Nivel de endeudamiento?                 | 0      | HTTP 500 — <meta name="viewport" conten |
| K04 | ¿Pasivo corriente vs activo corriente?   | 0      | HTTP 500 — <meta name="viewport" conten |
| K05 | ¿Capital de trabajo?                     | 0      | HTTP 500 — <meta name="viewport" conten |
| K06 | ¿Inventarios por categoría?              | 0      | HTTP 500 — <meta name="viewport" conten |
| K07 | ¿Activos fijos netos?                    | 0      | HTTP 500 — <meta name="viewport" conten |
| K08 | ¿Depreciación acumulada?                 | 0      | HTTP 500 — <meta name="viewport" conten |
| K09 | ¿Préstamos vigentes y saldos?            | 0      | HTTP 500 — <meta name="viewport" conten |
| K10 | ¿Obligaciones tributarias pendientes?    | 0      | HTTP 500 — <meta name="viewport" conten |


## Estados financieros — L. Indicadores financieros


| ID  | Pregunta                               | Prueba | Detalle                                 |
| --- | -------------------------------------- | ------ | --------------------------------------- |
| L01 | ¿Liquidez corriente?                   | 0      | HTTP 500 — <meta name="viewport" conten |
| L02 | ¿Prueba ácida?                         | 0      | HTTP 500 — <meta name="viewport" conten |
| L03 | ¿Rotación de inventarios?              | 0      | HTTP 500 — <meta name="viewport" conten |
| L04 | ¿Rotación de activos?                  | 0      | HTTP 500 — <meta name="viewport" conten |
| L05 | ¿ROA (rentabilidad sobre activos)?     | 0      | HTTP 500 — <meta name="viewport" conten |
| L06 | ¿ROE (rentabilidad sobre patrimonio)?  | 0      | HTTP 500 — <meta name="viewport" conten |
| L07 | ¿Apalancamiento financiero?            | 0      | HTTP 500 — <meta name="viewport" conten |
| L08 | ¿Punto de equilibrio estimado?         | 0      | HTTP 500 — <meta name="viewport" conten |
| L09 | ¿Alertas de deterioro financiero?      | 0      | HTTP 500 — <meta name="viewport" conten |
| L10 | ¿Proyección financiera a 3/6/12 meses? | 0      | HTTP 500 — <meta name="viewport" conten |


---

## Cobertura IA (resumen)

- Tabla detallada vista/fuente: **preguntas_cobertura_IA.md**
- Script de vistas: **domentacion/bbdd/GestionBI_IA_capa_completa.sql**
- Tests contra /api/chat: **npm run test:preguntas-todas**

