import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { runConsultarDatosForSkill } from "@/lib/consultarDatos";
import {
  BI_SKILL_GATES,
  BI_SKILL_TOOLS,
  type BiSkillToolName,
} from "@/lib/biSkillTools";
import { getDB, syncVentasNetaDetalle } from "@/lib/db";
import {
  getBiMaxToolCallsPerTurn,
  getLLMSetup,
  streamingTurnWithModelFallback,
} from "@/lib/llmClient";
import { buildBiAgentSystemPrompt } from "@/lib/biMasterPrompt";
import { trimConversationForModel } from "@/lib/trimMessages";
import { SYNC_WARNING_APPENDIX } from "@/lib/systemPrompt";
import {
  extractRequestedDateRange,
  extractRequestedYears,
  formatMetadataForSystemPrompt,
  formatPartialYearCoverageNote,
  formatSinDatosPeriodoMessage,
  getGlobalFechaRange,
  getOrFetchMetadata,
  mesCalendarioSinDatosEnMeta,
  userAsksMesActualOrHoy,
  yearsOutsideMetadataCoverage,
  V_METADATA_SISTEMA_QUERY,
} from "@/lib/metadataSession";
import { BI_RESPONSE_QUALITY_APPEND } from "@/lib/biResponseRules";
import {
  AssistantOutputSanitizer,
  stripAssistantForbiddenPhrases,
} from "@/lib/biStreamSanitize";
import {
  isBiAgentDebugLogsEnabled,
  isBiShowSqlInChatEnabled,
  isBiSqlConsoleLogEnabled,
} from "@/lib/biEnv";
import {
  buildExportTemplateForSql,
  formatExportDataJsonBlock,
  type ExportDataTemplate,
} from "@/lib/listadoEnrichment";

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  const v = raw ? parseInt(raw, 10) : NaN;
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function envFloat(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  const v = raw ? parseFloat(raw) : NaN;
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Reexportes de biEnv (compatibilidad con imports existentes). */
export {
  isBiAgentDebugLogsEnabled,
  isBiShowSqlInChatEnabled,
  isBiSqlConsoleLogEnabled,
} from "@/lib/biEnv";

function formatSqlStreamBlock(skill: string, sql: string): string {
  return `\n\n**Consulta SQL** (\`${skill}\`):\n\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n`;
}

function logSqlToConsole(
  label: string,
  sql: string,
  extra?: Record<string, unknown>
): void {
  if (!isBiSqlConsoleLogEnabled()) return;
  if (extra && Object.keys(extra).length) {
    console.info(`[BI SQL] ${label}`, extra);
  } else {
    console.info(`[BI SQL] ${label}`);
  }
  console.info(sql);
}

function biLog(msg: string, data?: Record<string, unknown>) {
  if (!isBiAgentDebugLogsEnabled()) return;
  if (data && Object.keys(data).length) {
    console.info(`[BI agent] ${msg}`, data);
  } else {
    console.info(`[BI agent] ${msg}`);
  }
}

function sqlPreviewFromToolCall(tc: ChatCompletionMessageToolCall): string {
  if (tc.type !== "function" || !tc.function?.arguments) return "";
  try {
    const args = JSON.parse(tc.function.arguments) as { sql?: string };
    return (args.sql ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  } catch {
    return "(args no JSON)";
  }
}

function fullSqlFromToolCall(tc: ChatCompletionMessageToolCall): string | null {
  if (tc.type !== "function" || !tc.function?.arguments) return null;
  try {
    const args = JSON.parse(tc.function.arguments) as { sql?: string };
    const s = args.sql?.trim();
    return s || null;
  } catch {
    return null;
  }
}

const tools = BI_SKILL_TOOLS;

function isBiSkillToolName(name: string): name is BiSkillToolName {
  return name in BI_SKILL_GATES;
}

function userMessageText(
  msg: ChatCompletionMessageParam | undefined
): string {
  if (!msg || msg.role !== "user") return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
      .join(" ");
  }
  return "";
}

/** Mensaje corto que solo pide descarga (sin nueva pregunta de negocio). */
function isExportOnlyUserMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 160) return false;

  if (
    /^(s[ií]|ok|dale|claro|por\s*favor|ya)[,.\s!]*(genera|exporta|descarga|p[aá]same|dame|env[ií]a)/.test(
      t
    ) &&
    /\b(excel|xlsx|csv|archivo)\b/.test(t)
  ) {
    return true;
  }

  if (
    /^(genera|exporta|descarga|dame|quiero|en)\s+(un\s+)?(el\s+)?(excel|csv|archivo)/.test(
      t
    )
  ) {
    return true;
  }

  const wantsFile =
    /\b(excel|xlsx|csv|descarga|exporta|archivo|listado\s+completo)\b/.test(
      t
    );
  if (!wantsFile) return false;
  const newQuestion =
    /\b(cu[aá]nto|ventas?|clientes?\s+nuevos?|productos?|margen|top\s*\d|qui[eé]n|cu[aá]les?|muestra|dame\s+los|lista\s+de)\b/.test(
      t
    );
  return (
    !newQuestion ||
    /^(dame|quiero|en)\s+(el\s+)?(excel|csv|archivo)/.test(t)
  );
}

/** Turno actual: desde la pregunta de negocio hasta antes del «dame Excel». */
function turnWindowBeforeExportRequest(
  messages: ChatCompletionMessageParam[]
): ChatCompletionMessageParam[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return messages;
  const exportAsk = isExportOnlyUserMessage(userMessageText(messages[lastUserIdx]));
  if (!exportAsk) return messages;

  let prevUserIdx = -1;
  for (let i = lastUserIdx - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      prevUserIdx = i;
      break;
    }
  }
  const start = prevUserIdx >= 0 ? prevUserIdx : 0;
  return messages.slice(start, lastUserIdx);
}

function sqlFromAssistantToolCall(
  messages: ChatCompletionMessageParam[],
  toolCallId: string
): { skill: BiSkillToolName; sql: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !("tool_calls" in m) || !m.tool_calls) continue;
    for (const tc of m.tool_calls) {
      if (tc.id !== toolCallId || tc.type !== "function") continue;
      const fn = tc.function?.name ?? "";
      if (!isBiSkillToolName(fn)) continue;
      const sql = fullSqlFromToolCall(tc);
      if (sql) return { skill: fn, sql };
    }
  }
  return null;
}

function exportFromToolPayload(
  p: Record<string, unknown>
): { block: string; title: string; rowCount: number } | null {
  if (typeof p.exportDataJsonBlock === "string" && p.exportDataJsonBlock) {
    const tpl = parseExportTemplate(p.exportDataTemplate);
    return {
      block: p.exportDataJsonBlock,
      title: tpl?.title ?? "Listado completo",
      rowCount: tpl?.rowCountExpected ?? (Number(p.businessTotal) || 0),
    };
  }
  const tpl = parseExportTemplate(p.exportDataTemplate);
  if (tpl) {
    return {
      block: formatExportDataJsonBlock(tpl),
      title: tpl.title,
      rowCount: tpl.rowCountExpected,
    };
  }
  return null;
}

function parseExportTemplate(raw: unknown): ExportDataTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ty = String(o.type ?? "").toLowerCase();
  if (ty !== "exportdata" && ty !== "exportcsv") return null;
  if (typeof o.sql !== "string" || !o.sql.trim()) return null;
  const skill = String(o.skill ?? "consultar_comercial");
  if (!isBiSkillToolName(skill)) return null;
  return {
    type: "exportData",
    skill,
    sql: o.sql.trim(),
    fileName: String(o.fileName ?? "export").replace(/[^\w.-]+/g, "_"),
    title: String(o.title ?? "Listado completo"),
    rowCountExpected: Number(o.rowCountExpected) || 0,
  };
}

function skillFromAssistantContent(content: string): BiSkillToolName {
  const m = content.match(/\*\*Consulta SQL\*\*\s*\(`([^`]+)`\)/i);
  if (m && isBiSkillToolName(m[1])) return m[1];
  return "consultar_comercial";
}

function sqlFromAssistantContent(content: string): string | null {
  const re = /```sql\s*([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    last = m[1].trim();
  }
  return last;
}

function rowCountFromAssistantText(content: string): number {
  const patterns = [
    /encontr[eé]\s+un\s+total\s+de\s+([\d.,]+)/i,
    /total\s+de\s+([\d.,]+)\s+clientes/i,
    /([\d.,]+)\s+clientes\s+nuevos/i,
    /hay\s+([\d.,]+)\s+en\s+total/i,
    /([\d.,]+)\s+resultados\s+en\s+total/i,
    /archivo\s+completo\s*\(([\d.,]+)\s+filas\)/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (!m) continue;
    const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function exportFromAssistantContent(
  content: string
): { block: string; title: string; rowCount: number } | null {
  const jsonMatch = content.match(
    /```json\s*(\{[\s\S]*?"type"\s*:\s*"exportData"[\s\S]*?\})\s*```/i
  );
  if (jsonMatch) {
    const tpl = parseExportTemplate(JSON.parse(jsonMatch[1]));
    if (tpl) {
      return {
        block: formatExportDataJsonBlock(tpl),
        title: tpl.title,
        rowCount: tpl.rowCountExpected,
      };
    }
  }

  const sql = sqlFromAssistantContent(content);
  if (!sql) return null;
  const rowCount = rowCountFromAssistantText(content);
  const tpl = buildExportTemplateForSql(
    skillFromAssistantContent(content),
    sql,
    rowCount > 0 ? rowCount : 1
  );
  if (!tpl) return null;
  return {
    block: formatExportDataJsonBlock(tpl),
    title: tpl.title,
    rowCount: tpl.rowCountExpected,
  };
}

function resolveExportForCurrentTurn(
  messages: ChatCompletionMessageParam[]
): { block: string; title: string; rowCount: number } | null {
  const window = turnWindowBeforeExportRequest(messages);
  const searchIn = window.length ? window : messages;

  for (let i = searchIn.length - 1; i >= 0; i--) {
    const m = searchIn[i];
    if (m.role !== "tool" || typeof m.content !== "string") continue;

    let p: Record<string, unknown>;
    try {
      p = JSON.parse(m.content) as Record<string, unknown>;
    } catch {
      continue;
    }

    const fromPayload = exportFromToolPayload(p);
    if (fromPayload) return fromPayload;

    const toolCallId =
      "tool_call_id" in m && typeof m.tool_call_id === "string"
        ? m.tool_call_id
        : "";
    const sqlCtx = toolCallId
      ? sqlFromAssistantToolCall(searchIn, toolCallId)
      : null;
    if (!sqlCtx) continue;

    const rowCount =
      Number(p.businessTotal) ||
      Number(p.sourceRowsAfterSqlCap) ||
      Number(p.rowCount) ||
      0;
    const tpl = buildExportTemplateForSql(
      sqlCtx.skill,
      sqlCtx.sql,
      rowCount
    );
    if (!tpl) continue;
    return {
      block: formatExportDataJsonBlock(tpl),
      title: tpl.title,
      rowCount: tpl.rowCountExpected,
    };
  }

  for (let i = searchIn.length - 1; i >= 0; i--) {
    const m = searchIn[i];
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    try {
      const fromAssistant = exportFromAssistantContent(m.content);
      if (fromAssistant) return fromAssistant;
    } catch {
      continue;
    }
  }

  return null;
}

export type BiRunResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status?: number };

async function runOneToolCall(
  tc: ChatCompletionMessageToolCall
): Promise<{ id: string; content: string }> {
  if (tc.type !== "function" || !("function" in tc) || !tc.function) {
    return {
      id: tc.id,
      content: JSON.stringify({ error: "Solo se admite function tool" }),
    };
  }
  const fn = tc.function.name;
  if (isBiSkillToolName(fn)) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}") as { sql?: string };
      if (!args.sql) {
        biLog("skill_skip", { skill: fn, reason: "missing_sql", toolCallId: tc.id });
        return { id: tc.id, content: JSON.stringify({ error: "Falta sql" }) };
      }
      logSqlToConsole(`skill:${fn}`, args.sql, { toolCallId: tc.id });
      const gate = BI_SKILL_GATES[fn];
      const t0 = Date.now();
      const content = await runConsultarDatosForSkill(args.sql, gate, fn);
      biLog("skill_done", {
        skill: fn,
        ms: Date.now() - t0,
        resultChars: content.length,
        toolCallId: tc.id,
      });
      return { id: tc.id, content };
    } catch (err) {
      biLog("skill_error", {
        skill: fn,
        error: err instanceof Error ? err.message : String(err),
        toolCallId: tc.id,
      });
      const msg = err instanceof Error ? err.message : "Error en consulta";
      biLog("skill_error_retry_exhausted", { skill: fn, error: msg });
      return {
        id: tc.id,
        content: JSON.stringify({
          rows: [],
          rowCount: 0,
          coverageNote:
            "Reintentos automáticos agotados. Responde con ventas netas por año desde METADATA; no menciones errores técnicos.",
          listadoUiEs:
            "Prohibido decir error de conexión. Indica cifras o 0 por año pedido.",
        }),
      };
    }
  }
  biLog("skill_unknown", { name: fn, toolCallId: tc.id });
  return {
    id: tc.id,
    content: JSON.stringify({ error: "Herramienta desconocida" }),
  };
}

/**
 * Respuesta del agente como stream UTF-8: tokens del modelo en vivo.
 */
export function createBiAgentReadableStream(options: {
  messages: ChatCompletionMessageParam[];
  syncFirst: boolean;
  sessionId: string;
}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(enc.encode(s));

      try {
        const { messages: incoming, syncFirst, sessionId } = options;
        if (!incoming.length) {
          push("Error: messages requerido.");
          controller.close();
          return;
        }

        let llm: ReturnType<typeof getLLMSetup>;
        try {
          llm = getLLMSetup();
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Configuración de IA incompleta.";
          push(`Error: ${msg}`);
          controller.close();
          return;
        }

        const showSqlInChat = isBiShowSqlInChatEnabled();

        let syncOk = true;
        if (syncFirst) {
          try {
            await syncVentasNetaDetalle();
          } catch {
            syncOk = false;
          }
        }

        // 1) Metadata (cache por sesión) + warm-up del pool SQL en paralelo → primer query más rápida.
        const [meta] = await Promise.all([
          getOrFetchMetadata(sessionId),
          getDB().catch(() => undefined),
        ]);
        const metaBlock = formatMetadataForSystemPrompt(meta.rows, {
          loadFailed: meta.metadataLoadFailed === true,
        });

        // 2) Sin datos para «mes actual»/período fuera de cobertura → explicar (no SQL ni cifras de 2025).
        const lastIncomingUser = [...incoming]
          .reverse()
          .find((m) => m.role === "user");
        const lastIncomingUserText =
          typeof lastIncomingUser?.content === "string"
            ? lastIncomingUser.content
            : "";
        const askKind = userAsksMesActualOrHoy(lastIncomingUserText);

        if (
          askKind === "mes" &&
          mesCalendarioSinDatosEnMeta(meta.rows) &&
          !meta.metadataLoadFailed
        ) {
          push(
            formatSinDatosPeriodoMessage(meta.rows, "mes_calendario")
          );
          controller.close();
          return;
        }

        const requested = extractRequestedDateRange(incoming);
        const global = getGlobalFechaRange(meta.rows);
        if (
          requested &&
          global.desde &&
          global.hasta &&
          (requested.hasta < global.desde || requested.desde > global.hasta) &&
          (askKind === "mes" || askKind === "dia")
        ) {
          const kind = askKind === "mes" ? "mes_calendario" : "dia_calendario";
          push(formatSinDatosPeriodoMessage(meta.rows, kind));
          controller.close();
          return;
        }

        const requestedYears = extractRequestedYears(lastIncomingUserText);
        const outsideYears = yearsOutsideMetadataCoverage(
          meta.rows,
          requestedYears
        );
        const partialYearNote =
          outsideYears.length && !meta.metadataLoadFailed
            ? formatPartialYearCoverageNote(meta.rows, outsideYears)
            : "";

        const dataUpdateNote =
          meta.refreshed &&
          meta.previousTotalRegistros !== null &&
          meta.previousTotalRegistros !== meta.totalRegistros
            ? `\n\n[AVISO] Se detectó una actualización de datos (TOTAL_REGISTROS cambió de ${meta.previousTotalRegistros} a ${meta.totalRegistros}). Menciónalo al inicio de tu respuesta en una sola frase.\n`
            : "";

        const basePrompt =
          buildBiAgentSystemPrompt(null, true) +
          BI_RESPONSE_QUALITY_APPEND +
          (syncOk ? "" : SYNC_WARNING_APPENDIX);
        const systemContent =
          basePrompt + metaBlock + partialYearNote + dataUpdateNote;

        const system: ChatCompletionMessageParam = {
          role: "system",
          content: systemContent,
        };

        const trimmed = trimConversationForModel(incoming);
        const working: ChatCompletionMessageParam[] = [system, ...trimmed];

        const lastUserText = userMessageText(
          [...trimmed].reverse().find((m) => m.role === "user")
        );
        if (isExportOnlyUserMessage(lastUserText)) {
          const prior = resolveExportForCurrentTurn(trimmed);
          if (prior) {
            const nNote =
              prior.rowCount > 0
                ? ` (${prior.rowCount.toLocaleString("es-EC")} filas)`
                : "";
            push(
              `**${prior.title}** — archivo completo${nNote}. Usa **Excel** o **CSV** abajo.\n\n${prior.block}\n`
            );
            biLog("export_only_shortcut", { title: prior.title });
            controller.close();
            return;
          }
        }

        biLog("stream_start", {
          sessionId,
          syncFirst,
          userTurns: trimmed.length,
        });
        logSqlToConsole("metadata:V_METADATA_SISTEMA", V_METADATA_SISTEMA_QUERY, {
          sessionId,
          refreshed: meta.refreshed,
        });
        if (syncFirst) {
          logSqlToConsole(
            "etl:USP_COM_VENTAS_NETA_DETALLE",
            "EXEC USP_COM_VENTAS_NETA_DETALLE @IDEMPRESAS, @PERIODOS, @procesar",
            { syncOk }
          );
        }

        // Una iteración = una sola ronda de herramientas (1 SQL mega con CTEs/UNION ALL).
        // Si hubo tool_calls, siempre sigue una vuelta de síntesis (texto al usuario), no cuenta como iteración.
        const maxIterations = envInt("BI_MAX_ITERATIONS", 1, 1, 12);
        const maxCompletionTokens = envInt(
          "BI_MAX_COMPLETION_TOKENS",
          2048,
          1024,
          16384
        );
        const llmTemperature = envFloat("BI_LLM_TEMPERATURE", 1, 0, 2);
        const llmTopP = envFloat("BI_LLM_TOP_P", 1, 0, 1);
        let iteration = 0;
        let finished = false;

        while (iteration < maxIterations && !finished) {
          iteration += 1;
          biLog("llm_turn_start", {
            iteration,
            maxIterations,
            toolChoice: "auto",
          });

          let assistantDeltaBuf = "";
          const { content, toolCalls, toolCallsTruncated, finishReason } =
            await streamingTurnWithModelFallback(
              llm.client,
              llm.provider,
              working,
              {
                tools,
                tool_choice: "auto",
                temperature: llmTemperature,
                top_p: llmTopP,
                max_completion_tokens: maxCompletionTokens,
              },
              (delta) => {
                assistantDeltaBuf += delta;
              }
            );
          if (toolCalls?.length) {
            biLog("assistant_pre_tool_suppressed", {
              chars: stripAssistantForbiddenPhrases(assistantDeltaBuf).length,
            });
            if (showSqlInChat) {
              for (const tc of toolCalls) {
                const skill =
                  tc.type === "function" ? tc.function?.name ?? "sql" : "sql";
                const sqlText = fullSqlFromToolCall(tc);
                if (sqlText) push(formatSqlStreamBlock(skill, sqlText));
              }
            }
          } else {
            const streamSan = new AssistantOutputSanitizer();
            streamSan.feed(assistantDeltaBuf, push);
            streamSan.flush(push);
          }

          const toolNames =
            toolCalls?.map((tc) =>
              tc.type === "function" ? tc.function?.name ?? tc.type : tc.type
            ) ?? [];

          biLog("llm_turn_end", {
            iteration,
            finishReason: finishReason ?? null,
            assistantChars: content.length,
            toolCallsCount: toolCalls?.length ?? 0,
            skills: toolNames,
            toolCallsTruncated: toolCallsTruncated ?? false,
          });

          if (toolCallsTruncated) {
            const cap = getBiMaxToolCallsPerTurn();
            biLog("tool_calls_truncated", { cap });
          }

          if (toolCalls?.length) {
            toolCalls.forEach((tc, i) => {
              const name =
                tc.type === "function" ? tc.function?.name ?? "?" : tc.type;
              biLog("skill_invoke", {
                iteration,
                index: i + 1,
                of: toolCalls.length,
                skill: name,
                sqlPreview: sqlPreviewFromToolCall(tc),
                toolCallId: tc.id,
              });
            });

            const cleanedContent = stripAssistantForbiddenPhrases(content);
            const assistantMsg: ChatCompletionAssistantMessageParam = {
              role: "assistant",
              content: cleanedContent.length ? cleanedContent : null,
              tool_calls: toolCalls,
            };
            working.push(assistantMsg);

            const batchT0 = Date.now();
            const results = await Promise.all(
              toolCalls.map((tc) => runOneToolCall(tc))
            );
            biLog("skills_batch_complete", {
              iteration,
              count: toolCalls.length,
              ms: Date.now() - batchT0,
            });
            for (const r of results) {
              const tm: ChatCompletionToolMessageParam = {
                role: "tool",
                tool_call_id: r.id,
                content: r.content,
              };
              working.push(tm);
            }

            continue;
          }

          finished = true;
        }

        if (!finished) {
          biLog("synthesis_turn", {
            reason: "max_iterations",
            maxIterations,
            toolChoice: "none",
          });
          const synSan = new AssistantOutputSanitizer();
          await streamingTurnWithModelFallback(
            llm.client,
            llm.provider,
            working,
            {
              tools,
              tool_choice: "none",
              temperature: llmTemperature,
              top_p: llmTopP,
              max_completion_tokens: maxCompletionTokens,
            },
            (delta) => synSan.feed(delta, push)
          );
          synSan.flush(push);
        }

        biLog("stream_end", { sessionId });
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error OpenAI / red";
        biLog("stream_error", {
          message: msg,
          sessionId: options.sessionId,
        });
        push(`\n\nError: ${msg}`);
        controller.close();
      }
    },
  });
}

export async function runBiAgentCompletion(options: {
  messages: ChatCompletionMessageParam[];
  syncFirst: boolean;
  sessionId?: string;
}): Promise<BiRunResult> {
  const stream = createBiAgentReadableStream({
    ...options,
    sessionId: options.sessionId ?? "server",
  });
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let acc = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
    }
    return { ok: true, text: acc };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo respuesta";
    return { ok: false, error: msg, status: 500 };
  }
}
