# Cobertura IA vs `preguntas.md` (DeltaMontero / CORA)

Después de aplicar **`domentacion/bbdd/GestionBI_IA_capa_completa.sql`** en `GestionBI` (con lectura a `banda`), la IA puede responder **con datos** las áreas marcadas **Sí (TR)** en tiempo real o **Sí (H+TR)** (histórico + LIVE en `V_MAESTRA_VENTAS`).

Leyenda: **TR** = operación / vistas sobre ERP en vivo; **H** = histórico META/warehouse; **Proxy** = indicador aproximado, no estado financiero NIIF completo; **No** = requiere módulo contable u otras fuentes no modeladas aquí.

| Bloque en preguntas.md | ¿Datos mínimos? | Vista / fuente principal |
|------------------------|-----------------|---------------------------|
| Ventas totales mes / comparativos / YTD / línea / canal / vendedor / top clientes | Sí (H+TR) | `V_MAESTRA_VENTAS` (`ORIGEN` WAREHOUSE vs LIVE) |
| Clientes nuevos / % participación / concentración | Sí (H+TR) | `V_MAESTRA_VENTAS` + agregaciones |
| Márgenes, tickets, costo por producto, margen negativo, canal | Sí (H+TR) | `V_MAESTRA_VENTAS` |
| Ventas vs costos fijos | Sí si hay monto | `V_IA_PARAMETROS_NEGOCIO` (`COSTOS_FIJOS_MENSUAL_ESTIMADO`) + ventas |
| Facturas pendientes cobro / cartera / aging / mora | Sí (TR) | `V_MAESTRA_CARTERA`, `FAC_FACTURAS` |
| NC / anuladas / descuentos / retención / gravadas exentas | Parcial (TR) | `FAC_FACTURAS`, `FAC_MOVIMIENTOS`, líneas según skill |
| Cierre de caja (resumen) | Sí (TR) | `V_MAESTRA_CIERRE_CAJA` |
| Proyección cierre mes/año | Proxy | Series históricas + heurística (sin prometer precisión contable) |
| Cuentas por cobrar (totales, buckets, DSO proxy, etc.) | Sí (TR) | `V_MAESTRA_CARTERA` |
| Cuentas por pagar | Sí (TR) | `V_MAESTRA_CUENTAS_PAGAR` |
| Inventario stock / valorizado / mínimos / alertas | Sí (TR) | `V_MAESTRA_INVENTARIO` |
| Rotación / DIO / obsolescencia / físico vs contable | Parcial / No | Algunos con proxy inventario+ventas; ajustes físicos no centralizados |
| Tesorería flujo | Sí (TR) | `V_MAESTRA_TESORERIA` |
| Saldos bancarios | Sí (TR) | `V_MAESTRA_BANCOS` |
| Estados financieros (P&L, balance, ROA/ROE, EBIT…) | No / Proxy muy limitado | No hay GL completo en estas vistas; usar proxies y declarar límite |
| Punto de equilibrio con costos fijos | Sí si parámetro cargado | `V_IA_PARAMETROS_NEGOCIO` + margen/ventas |

**Carga de costos fijos (ejemplo):**

```sql
UPDATE GestionBI.dbo.IA_PARAMETROS_NEGOCIO
SET VALOR_NUMERICO = 25000.00, ACTUALIZADO = GETDATE()
WHERE CLAVE = N'COSTOS_FIJOS_MENSUAL_ESTIMADO';
```

**Ejecución del script:** en SSMS o `sqlcmd`, usuario con permisos sobre `GestionBI` y `banda`, abrir y ejecutar `domentacion/bbdd/GestionBI_IA_capa_completa.sql`.

Si `V_MAESTRA_CUENTAS_PAGAR` falla por nombres de columnas en `FAC_FACT_PROV`, comparar con `SELECT TOP 1 * FROM banda.dbo.FAC_FACT_PROV` y ajustar el `CREATE VIEW`.
