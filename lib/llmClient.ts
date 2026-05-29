/**
 * Cliente LLM para CORA IA.
 *
 * - API oficial OpenAI (sin OPENAI_BASE_URL): **Responses API** (`client.responses.stream`).
 * - Azure OpenAI y proveedores compatibles (OPENAI_BASE_URL): Chat Completions.
 *
 * OpenAI limita a 128 tool calls por vuelta; si el modelo pide más, se truncan
 * (`BI_MAX_TOOL_CALLS_PER_TURN`). `parallel_tool_calls: true` en ambos modos.
 */
import OpenAI, { APIError, AzureOpenAI } from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  FunctionTool,
  Response,
  ResponseInput,
} from "openai/resources/responses/responses";

export type LLMProvider = "openai" | "azure" | "compatible";

/** Límite documentado de la API de chat completions (mensaje assistant.tool_calls). */
const OPENAI_MAX_TOOL_CALLS_PER_ASSISTANT_MESSAGE = 128;
const DEFAULT_BI_TOOL_CALLS_PER_TURN = 1;

function maxToolCallsPerTurn(): number {
  const raw = process.env.BI_MAX_TOOL_CALLS_PER_TURN?.trim();
  const v = raw ? parseInt(raw, 10) : NaN;
  const n = Number.isFinite(v) ? v : DEFAULT_BI_TOOL_CALLS_PER_TURN;
  return Math.min(
    OPENAI_MAX_TOOL_CALLS_PER_ASSISTANT_MESSAGE,
    Math.max(1, n)
  );
}

/** Tope efectivo de tool_calls por vuelta (env `BI_MAX_TOOL_CALLS_PER_TURN`, máx. 128). */
export function getBiMaxToolCallsPerTurn(): number {
  return maxToolCallsPerTurn();
}

export interface LLMSetup {
  client: OpenAI;
  provider: LLMProvider;
}

function normalizeCompatibleBaseURL(raw: string): string {
  const u = raw.replace(/\/$/, "");
  return u.endsWith("/v1") ? u : `${u}/v1`;
}

/**
 * Prioridad: 1) Azure OpenAI (empresas), 2) API compatible (OpenRouter, Groq, LM Studio…), 3) OpenAI estándar.
 */
export function getLLMSetup(): LLMSetup {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();

  if (azureEndpoint && azureKey && azureDeployment) {
    const endpoint = azureEndpoint.endsWith("/")
      ? azureEndpoint
      : `${azureEndpoint}/`;
    const client = new AzureOpenAI({
      endpoint,
      apiKey: azureKey,
      deployment: azureDeployment,
      apiVersion:
        process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-10-21",
    });
    return { client, provider: "azure" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta OPENAI_API_KEY, o configura Azure: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY y AZURE_OPENAI_DEPLOYMENT."
    );
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  if (baseURL) {
    const client = new OpenAI({
      apiKey,
      baseURL: normalizeCompatibleBaseURL(baseURL),
    });
    return { client, provider: "compatible" };
  }

  return { client: new OpenAI({ apiKey }), provider: "openai" };
}

/**
 * Responses API solo en `api.openai.com` (provider `openai`).
 * Desactivar explícitamente: OPENAI_USE_RESPONSES_API=0
 */
export function shouldUseResponsesApi(provider: LLMProvider): boolean {
  const raw = process.env.OPENAI_USE_RESPONSES_API?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return provider === "openai";
}

function messageContentToString(
  content: ChatCompletionMessageParam["content"]
): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "object" && c && "text" in c) {
          return String((c as { text?: string }).text ?? "");
        }
        return "";
      })
      .join(" ");
  }
  return String(content);
}

export function chatToolsToResponseTools(
  tools: ChatCompletionTool[]
): FunctionTool[] {
  return tools
    .filter(
      (t): t is Extract<ChatCompletionTool, { type: "function" }> =>
        t.type === "function"
    )
    .map((t) => ({
      type: "function" as const,
      name: t.function.name,
      description: t.function.description ?? null,
      parameters: (t.function.parameters as Record<string, unknown>) ?? null,
      strict: false,
    }));
}

/** Convierte el historial (sin el mensaje system inicial) al formato `input` de Responses. */
export function chatMessagesToResponsesInput(
  messages: ChatCompletionMessageParam[]
): ResponseInput {
  const input: ResponseInput = [];
  for (const m of messages) {
    if (m.role === "user") {
      input.push({
        type: "message",
        role: "user",
        content: messageContentToString(m.content),
      });
      continue;
    }
    if (m.role === "assistant") {
      const text = messageContentToString(m.content).trim();
      const toolCalls =
        "tool_calls" in m && Array.isArray(m.tool_calls) ? m.tool_calls : null;
      if (text.length) {
        input.push({ type: "message", role: "assistant", content: text });
      }
      if (toolCalls?.length) {
        for (const tc of toolCalls) {
          if (tc.type !== "function") continue;
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments || "{}",
          });
        }
      }
      continue;
    }
    if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: messageContentToString(m.content),
      });
      continue;
    }
    if (m.role === "system" || m.role === "developer") {
      input.push({
        type: "message",
        role: "user",
        content: `[${m.role}] ${messageContentToString(m.content)}`,
      });
    }
  }
  return input;
}

function responseOutputToChatToolCalls(
  output: Response["output"],
  cap: number
): {
  toolCalls: ChatCompletionMessageToolCall[];
  truncated: boolean;
} {
  const raw: ChatCompletionMessageToolCall[] = [];
  for (const item of output) {
    if (item.type === "function_call") {
      raw.push({
        id: item.call_id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments ?? "{}",
        },
      });
    }
  }
  const truncated = raw.length > cap;
  const toolCalls = truncated ? raw.slice(0, cap) : raw;
  return { toolCalls, truncated };
}

export function getModelCandidates(provider: LLMProvider): string[] {
  if (provider === "azure") {
    const d = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
    return d ? [d] : [];
  }

  const primary = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const fromEnv = process.env.OPENAI_MODEL_FALLBACKS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const builtin = [
    "gpt-4o-mini",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-0125",
    "gpt-3.5-turbo-1106",
  ];
  const tail = fromEnv?.length ? fromEnv : builtin;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [primary, ...tail]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

function isModelAccessForbidden(err: unknown): boolean {
  if (!(err instanceof APIError) || err.status !== 403) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("does not have access to model") ||
    msg.includes("model_not_found") ||
    msg.includes("does not have access")
  );
}

function providerHint(provider: LLMProvider, models: string[]): string {
  if (provider === "azure") {
    return [
      "Revisa en Azure Portal el nombre exacto del deployment y que el recurso tenga quota.",
      `Deployment usado: ${models[0] ?? "(vacío)"}.`,
    ].join(" ");
  }
  if (provider === "compatible") {
    return [
      "Revisa OPENAI_BASE_URL (debe apuntar a un endpoint OpenAI-compatible, p. ej. …/v1) y OPENAI_MODEL según la documentación de ese proveedor.",
      `Intentados: ${models.join(", ")}.`,
    ].join(" ");
  }
  return [
    "En platform.openai.com un administrador debe habilitar modelos de chat para el proyecto, o crea una clave en otro proyecto que sí los tenga.",
    "Alternativa: Azure OpenAI (variables AZURE_OPENAI_*) o OPENAI_BASE_URL + clave de un proveedor compatible.",
    `Intentados: ${models.join(", ")}.`,
  ].join(" ");
}

export async function chatCompletionWithModelFallback(
  client: OpenAI,
  provider: LLMProvider,
  params: Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    "model" | "stream"
  >
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const models = getModelCandidates(provider);
  if (!models.length) {
    throw new Error(
      "AZURE_OPENAI_DEPLOYMENT no está definido; es obligatorio con Azure OpenAI."
    );
  }

  let lastErr: unknown;
  for (const model of models) {
    try {
      return await client.chat.completions.create({
        ...params,
        model,
        stream: false,
        parallel_tool_calls: true,
      });
    } catch (err) {
      lastErr = err;
      if (!isModelAccessForbidden(err)) throw err;
    }
  }

  const hint =
    lastErr instanceof APIError
      ? lastErr.message
      : "Error desconocido al llamar a la API.";
  throw new Error(
    [
      "No se pudo usar ningún modelo configurado.",
      providerHint(provider, models),
      `Detalle: ${hint}`,
    ].join(" ")
  );
}

export type StreamingTurnResult = {
  content: string;
  toolCalls: ChatCompletionMessageToolCall[] | undefined;
  finishReason: string | null;
  /** True si el modelo emitió más tool_calls que el tope y se truncó al máximo admitido. */
  toolCallsTruncated?: boolean;
};

export type StreamingTurnOptions = {
  tools: ChatCompletionTool[];
  tool_choice: "auto" | "none";
  temperature: number;
  top_p: number;
  max_completion_tokens: number;
};

/**
 * Un turno vía **Responses API** (stream + function calling unificado).
 */
export async function responsesStreamingTurnWithModelFallback(
  client: OpenAI,
  provider: LLMProvider,
  instructions: string,
  input: ResponseInput,
  responseTools: FunctionTool[],
  options: StreamingTurnOptions,
  onContentDelta: (chunk: string) => void
): Promise<StreamingTurnResult> {
  const models = getModelCandidates(provider);
  if (!models.length) {
    throw new Error(
      "AZURE_OPENAI_DEPLOYMENT no está definido; es obligatorio con Azure OpenAI."
    );
  }

  let lastErr: unknown;
  for (const model of models) {
    try {
      const stream = client.responses.stream({
        model,
        instructions,
        input,
        tools: responseTools,
        tool_choice: options.tool_choice,
        temperature: options.temperature,
        top_p: options.top_p,
        max_output_tokens: options.max_completion_tokens,
        parallel_tool_calls: true,
        stream: true,
        store: false,
      });

      stream.on("response.output_text.delta", (event: { delta: string }) => {
        if (event.delta) onContentDelta(event.delta);
      });

      const final = await stream.finalResponse();
      const cap = maxToolCallsPerTurn();
      const { toolCalls, truncated } = responseOutputToChatToolCalls(
        final.output,
        cap
      );
      const hasReal = toolCalls.some(
        (tc) => tc.type === "function" && tc.function.name
      );

      return {
        content: final.output_text ?? "",
        toolCalls: hasReal ? toolCalls : undefined,
        finishReason: null,
        ...(truncated ? { toolCallsTruncated: true } : {}),
      };
    } catch (err) {
      lastErr = err;
      if (!isModelAccessForbidden(err)) throw err;
    }
  }

  const hint =
    lastErr instanceof APIError
      ? lastErr.message
      : "Error desconocido al llamar a la API.";
  throw new Error(
    [
      "No se pudo usar ningún modelo configurado.",
      providerHint(provider, models),
      `Detalle: ${hint}`,
    ].join(" ")
  );
}

/**
 * Punto de entrada del agente BI: Responses API si aplica; si no, Chat Completions.
 * `working` debe empezar con un mensaje `role: system` (instrucciones + metadata).
 */
export async function streamingTurnWithModelFallback(
  client: OpenAI,
  provider: LLMProvider,
  working: ChatCompletionMessageParam[],
  options: StreamingTurnOptions,
  onContentDelta: (chunk: string) => void
): Promise<StreamingTurnResult> {
  if (!working.length || working[0].role !== "system") {
    throw new Error("El historial debe comenzar con role: system.");
  }
  const instructions = messageContentToString(working[0].content);
  const rest = working.slice(1);

  if (shouldUseResponsesApi(provider)) {
    const input = chatMessagesToResponsesInput(rest);
    const responseTools = chatToolsToResponseTools(options.tools);
    return responsesStreamingTurnWithModelFallback(
      client,
      provider,
      instructions,
      input,
      responseTools,
      options,
      onContentDelta
    );
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: instructions },
    ...rest,
  ];
  return chatStreamingTurnWithModelFallback(
    client,
    provider,
    {
      messages,
      tools: options.tools,
      tool_choice: options.tool_choice,
      temperature: options.temperature,
      top_p: options.top_p,
      max_completion_tokens: options.max_completion_tokens,
    },
    onContentDelta
  );
}

/**
 * Una vuelta de chat con stream=true; reenvía trozos de texto del asistente en vivo.
 * Acumula tool_calls parciales del stream hasta el cierre.
 */
export async function chatStreamingTurnWithModelFallback(
  client: OpenAI,
  provider: LLMProvider,
  params: Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    "model" | "stream"
  >,
  onContentDelta: (chunk: string) => void
): Promise<StreamingTurnResult> {
  const models = getModelCandidates(provider);
  if (!models.length) {
    throw new Error(
      "AZURE_OPENAI_DEPLOYMENT no está definido; es obligatorio con Azure OpenAI."
    );
  }

  let lastErr: unknown;
  for (const model of models) {
    try {
      const stream = await client.chat.completions.create({
        ...params,
        model,
        stream: true,
        parallel_tool_calls: true,
      });

      let content = "";
      const toolCallsMap = new Map<
        number,
        { id?: string; name?: string; arguments: string }
      >();
      let finishReason: string | null = null;

      for await (const part of stream) {
        const choice = part.choices[0];
        if (!choice) continue;
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const delta = choice.delta;
        if (delta.content) {
          content += delta.content;
          onContentDelta(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const prev = toolCallsMap.get(idx) ?? { arguments: "" };
            if (tc.id) prev.id = tc.id;
            if (tc.function?.name) prev.name = tc.function.name;
            if (tc.function?.arguments) {
              prev.arguments += tc.function.arguments;
            }
            toolCallsMap.set(idx, prev);
          }
        }
      }

      const sortedIdx = Array.from(toolCallsMap.keys()).sort((a, b) => a - b);
      const cap = maxToolCallsPerTurn();
      const toolCallsTruncated = sortedIdx.length > cap;
      const limitedIdx = toolCallsTruncated ? sortedIdx.slice(0, cap) : sortedIdx;

      const toolCalls: ChatCompletionMessageToolCall[] | undefined =
        limitedIdx.length
          ? limitedIdx.map((idx) => {
              const acc = toolCallsMap.get(idx)!;
              return {
                id: acc.id || `call_${idx}`,
                type: "function" as const,
                function: {
                  name: acc.name || "",
                  arguments: acc.arguments || "{}",
                },
              };
            })
          : undefined;

      const hasRealToolCalls =
        toolCalls?.some((tc) => tc.type === "function" && tc.function.name);

      return {
        content,
        toolCalls: hasRealToolCalls ? toolCalls : undefined,
        finishReason,
        ...(toolCallsTruncated ? { toolCallsTruncated: true } : {}),
      };
    } catch (err) {
      lastErr = err;
      if (!isModelAccessForbidden(err)) throw err;
    }
  }

  const hint =
    lastErr instanceof APIError
      ? lastErr.message
      : "Error desconocido al llamar a la API.";
  throw new Error(
    [
      "No se pudo usar ningún modelo configurado.",
      providerHint(provider, models),
      `Detalle: ${hint}`,
    ].join(" ")
  );
}
