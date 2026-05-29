import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { stripArtifactPhrases } from "@/lib/biStreamSanitize";

function ei(name: string, d: number, lo: number, hi: number): number {
  const v = parseInt(process.env[name] || String(d), 10);
  const n = Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
}

const maxMsgs = () => ei("CHAT_HISTORY_MAX_MESSAGES", 14, 4, 80);

const maxChars = () => ei("CHAT_MESSAGE_MAX_CHARS", 10_000, 2_000, 50_000);

function stringifyContent(
  content: ChatCompletionMessageParam["content"]
): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
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

/**
 * Recorta historial para modelos con contexto pequeño (p. ej. 16k tokens).
 */
export function trimConversationForModel(
  messages: ChatCompletionMessageParam[]
): ChatCompletionMessageParam[] {
  const n = maxMsgs();
  const cap = maxChars();
  const slice = messages.slice(-n);
  return slice.map((m) => {
    const raw = stringifyContent(m.content);
    const text =
      m.role === "user" || m.role === "assistant"
        ? stripArtifactPhrases(raw)
        : raw;
    if (text.length <= cap) {
      if (text === raw) return m;
      if (m.role === "user") return { role: "user", content: text };
      if (m.role === "assistant") return { role: "assistant", content: text };
      return m;
    }
    const cut =
      stripArtifactPhrases(text.slice(0, cap)) +
      "\n\n[…recortado: pide de nuevo con menos detalle o nueva conversación…]";
    if (m.role === "user") return { role: "user", content: cut };
    if (m.role === "assistant") return { role: "assistant", content: cut };
    return m;
  });
}
