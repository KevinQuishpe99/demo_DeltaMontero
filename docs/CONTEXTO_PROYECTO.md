# Contexto del proyecto: ERP **banda**, BI **GestionBI** y chat **CORA IA**

Documento de referencia para humanos y asistentes de código. Describe el almacén analítico, las vistas que usa el agente y cómo está montada la aplicación **Next.js** en este repositorio (shell tipo CORA, streaming, consultas solo lectura a **GestionBI**).

---

## 1. Qué hace esta app

- Interfaz web con **chat** que llama a un **agente BI** (LLM + herramienta SQL).
- El agente solo ejecuta **SELECT** sobre vistas permitidas en **`GestionBI`** (no escribe en el ERP).
- **Antes de cada turno** se consulta **`GestionBI.dbo.V_METADATA_SISTEMA`** (con caché por sesión) y ese bloque se **inyecta en el system prompt** junto con reglas de negocio y columnas documentadas en código.
- Respuestas en **streaming** (texto en vivo) hacia el cliente.

La vista histórica **`V_IA_VENTAS_INTELLIGENT`** y KPIs en cabecera **no** son el núcleo actual del producto: el agente trabaja sobre **`V_MAESTRA_*`** y **`V_METADATA_SISTEMA`**.

---

## 2. Stack técnico

| Capa | Tecnología |
|------|------------|
| Framework | Next.js (App Router), React |
| API | Route Handlers en `app/api/*` |
| Base de datos | SQL Server (`mssql` / pool en `lib/db.ts`) |
| IA | OpenAI API, Azure OpenAI o proveedor compatible (`lib/llmClient.ts`) |
| Estilos | CSS modules (shell CORA), `app/globals.css` |

Variables de entorno: ver **`.env.example`** (`DB_*`, `OPENAI_*` o `AZURE_OPENAI_*`, `SYNC_*`, límites opcionales).

---

## 3. Arquitectura de datos (lógica de negocio)

| Rol | Base | Motor |
|-----|------|--------|
| ERP fuente | **banda** | SQL Server |
| BI / DWH | **GestionBI** | SQL Server |

- **banda**: facturación, stock, cartera, tesorería en tiempo real (prefijos `FAC_*`, `TES_*`, etc.).
- **GestionBI**: vistas maestras analíticas **`V_MAESTRA_*`**, metadata **`V_METADATA_SISTEMA`**, histórico típico vía ETL (p. ej. `META_VENTA_NETA` como fuente interna; el agente **no** consulta tablas ERP directamente).

Flujo conceptual:

```text
Usuario → Chat UI → POST /api/chat
 → biChatRunner (metadata + LLM + tool)
                    → consultarDatos(sql) → sqlGuard → SQL GestionBI
                    → stream de tokens al navegador
```

---

## 4. Rutas API relevantes

| Ruta | Uso |
|------|-----|
| **`POST /api/chat`** | Chat principal del UI. Body: `{ messages }`. **Sin sync** previo (`syncFirst: false`). Establece cookie **`cora_session`** si no existe; pasa `sessionId` al runner. Respuesta: **stream** `text/plain`. |
| **`GET /api/bi?q=...&sync=0\|1`** | Pregunta puntual sin historial; `sync=1` fuerza sync de ventas antes del agente (más lento). |
| **`POST /api/bi`** | `{ messages?, sync? }`; misma cookie y streaming. |
| **`POST/GET /api/etl`** | ETL programado o manual (según secretos configurados). |

---

## 5. Orquestación del agente (`lib/biChatRunner.ts`)

1. **`getLLMSetup()`** — cliente y proveedor (OpenAI / Azure / base URL custom).
2. **Sync opcional** — si `syncFirst`, ejecuta `syncVentasNetaDetalle()` (`lib/db.ts`); en `/api/chat` va en **false**.
3. **Metadata obligatoria** — `getOrFetchMetadata(sessionId)` (`lib/metadataSession.ts`):
   - Ejecuta un `SELECT` a **`V_METADATA_SISTEMA`** vía `runConsultarDatos`.
   - **Caché en memoria por `sessionId`**: TTL **5 minutos**.
4. **Guard de fechas** — `extractRequestedDateRange` sobre el último mensaje del usuario; si el rango pedido está **fuera** del rango global derivado de metadata, se responde con un mensaje corto **sin** llamar al LLM para el resto.
5. **Aviso de datos** — si al refrescar metadata cambia la suma **`TOTAL_REGISTROS`**, se añade una nota al system para que el modelo lo mencione.
6. **System prompt** — `BI_AGENT_SYSTEM_PROMPT` (`lib/biMasterPrompt.ts`) + **`formatMetadataForSystemPrompt(rows)`** + nota de sync/ETL si aplica.
7. **Bucle** — hasta **`BI_MAX_ITERATIONS`** (env, default **4**, rango 1–8): una vuelta LLM con streaming; si hay `tool_calls`, se ejecutan y se reenvía al modelo hasta respuesta final sin tools.

Herramienta expuesta al modelo: **`consultar_datos`** con un argumento `sql` (string). La descripción del tool en código lista las vistas maestras (alineado con el guard).

---

## 6. Consulta SQL del tool (`lib/consultarDatos.ts`)

- **`assertSafeSelect(sql)`** (`lib/sqlGuard.ts`) valida la sentencia antes de ejecutar.
- **Caché en memoria** del resultado JSON: **~20 s**, clave = SQL normalizado tras el guard.
- Límites de filas: **`SQL_QUERY_MAX_ROWS`** (default 2000), recorte adicional para el modelo **`SQL_AI_MAX_ROWS`** en `sqlGuard`; salida acotada con **`TOOL_OUTPUT_MAX_CHARS`**.

---

## 7. Guard SQL (`lib/sqlGuard.ts`)

- Solo **`SELECT`**; prohibido DDL/DML, `EXEC`, comentarios peligrosos, múltiples sentencias, etc.
- Debe aparecer **al menos una** vista de **`ALLOWED_BI_VIEWS`**:
  - `V_MAESTRA_VENTAS`
  - `V_MAESTRA_INVENTARIO`
  - `V_MAESTRA_CARTERA`
  - `V_MAESTRA_CIERRE_CAJA`
  - `V_MAESTRA_TESORERIA`
  - `V_METADATA_SISTEMA`
- Patrón que **bloquea** referencias típicas a tablas ERP banda (`FAC_`, `FMO_*`, etc.) y uso directo de ciertos prefijos documentados en el archivo.

---

## 8. Metadata por sesión (`lib/metadataSession.ts`)

- Tipos: filas con **`MODULO`**, **`ANIO_MINIMO/MAXIMO`**, **`FECHA_DESDE/HASTA`**, **`TOTAL_REGISTROS`**, etc. (forma devuelta por `V_METADATA_SISTEMA`).
- **`parseMetadataToolPayload`**: parsea el JSON que devuelve `runConsultarDatos`.
- **`getGlobalFechaRange`**: min/max de fechas entre módulos.
- **`extractRequestedDateRange`**: heurística sobre el último mensaje usuario (fechas `YYYY-MM-DD`, `YYYYMM`, año).
- **`getOrFetchMetadata(sessionId)`**: cache **5 min** por sesión.
- **`formatMetadataForSystemPrompt`**: texto que se concatena al system en cada request del runner.

Nota: **`getSistemaMetadata()`** en `biMasterPrompt.ts` es un flujo aparte (fila única / shape distinto, TTL10 min en proceso) usado por **`getBiAgentSystemPrompt()`**. El camino **activo del chat** es el bloque de filas vía **`metadataSession` + `biChatRunner`**.

---

## 9. Prompt maestro (`lib/biMasterPrompt.ts`)

- **`buildBiAgentSystemPrompt(meta, syncOk)`**: identidad CORA, arquitectura banda/GestionBI, **listado detallado de columnas** por vista maestra, mapeo pregunta→vista, ejemplos SQL, formato de respuesta y apéndice de herramienta/JSON para tablas o gráficos en UI.
- **`BI_AGENT_SYSTEM_PROMPT`**: export sincrónico `buildBiAgentSystemPrompt(null, true)` (la cobertura temporal “sin meta” se complementa en runtime con el bloque inyectado desde `V_METADATA_SISTEMA`).

---

## 10. Cliente LLM (`lib/llmClient.ts`)

- Resuelve API key, modelo, fallbacks y streaming.
- **`chatStreamingTurnWithModelFallback`**: un turno con deltas hacia el stream del route; manejo de tool calls según el proveedor.

---

## 11. UI (shell CORA)

- Componentes típicos: **`CoraAppShell`**, **`CoraSidebar`**, **`ChatPanel`**, **`StructuredBlocks`** (markdown / bloques JSON).
- Mientras el modelo no envía contenido, la UI evita mostrar placeholders como “Sin contenido”; puede mostrarse solo indicador de carga.
- Logos y assets en **`public/`**; favicon/app icon según `app/icon.png` / `layout.tsx`.

---

## 12. Referencia rápida: archivos clave

| Archivo | Responsabilidad |
|---------|-------------------|
| `app/api/chat/route.ts` | Entrada del chat; cookie `cora_session`; stream. |
| `app/api/bi/route.ts` | BI por GET/POST; sync opcional. |
| `lib/biChatRunner.ts` | Bucle agente + metadata + streaming. |
| `lib/consultarDatos.ts` | Ejecución SQL + caché corta. |
| `lib/sqlGuard.ts` | Validación y límites. |
| `lib/metadataSession.ts` | `V_METADATA_SISTEMA` por sesión. |
| `lib/biMasterPrompt.ts` | System prompt y documentación de vistas. |
| `lib/db.ts` | Pool SQL Server, sync ETL relacionado. |
| `lib/llmClient.ts` | OpenAI/Azure/compatible. |
| `lib/trimMessages.ts` | Recorte de historial para contexto. |
| `components/ChatPanel.tsx` | Envío de mensajes y lectura del stream. |

---

## 13. Variables de entorno útiles (además de `.env.example`)

| Variable | Efecto |
|----------|--------|
| `BI_MAX_ITERATIONS` | Máximo de rondas LLM + herramienta (default 4). |
| `SQL_QUERY_MAX_ROWS` | Tope de filas leídas tras el SELECT. |
| `SQL_AI_MAX_ROWS` | Tope enviado al modelo. |
| `TOOL_OUTPUT_MAX_CHARS` | Tamaño máximo del JSON de herramienta. |
| `CHAT_HISTORY_MAX_MESSAGES` / `CHAT_MESSAGE_MAX_CHARS` | Límites de conversación. |

---

## 14. Tablas ERP (banda) — contexto para entender el origen

El agente **no** consulta estas tablas directamente; sirven para entender de dónde salen los datos agregados en GestionBI.

| Área | Prefijo / tabla | Descripción breve |
|------|-------------------|-------------------|
| Facturas | `FAC_FACTURAS` (FFG_) | Cabecera |
| Movimientos | `FAC_MOVIMIENTOS` (FMO_) | Detalle |
| Clientes | `FAC_CLIENTES` (FCL_) | Maestro clientes |
| Productos | `FAC_BIEN_SERV` (TBS_) | Maestro ítems |
| Stock | `FAC_STOCK` (STK_) | Por bodega |
| Locales | `FAC_LOCALES` (LOC_) | Bodegas/locales |
| Cartera | `FAC_CARTERA` (FCC_) | CxC |
| Cierre caja | `FAC_CIERRE_CAJA` (CICA_) | Cierres |
| Tesorería | `TES_FLUJO` (FLJ_), etc. | Flujo caja/bancos |

Joins y convenciones detalladas del ERP pueden mantenerse en documentación de negocio aparte; las **columnas consultables por IA** están descritas en **`lib/biMasterPrompt.ts`** para las vistas **`V_MAESTRA_*`**.

---

*Última alineación con código: vistas maestras, `V_METADATA_SISTEMA` al inicio con caché por sesión, streaming en `/api/chat`, tool `consultar_datos`, sin KPI ribbon en la UI principal.*
