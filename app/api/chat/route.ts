import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NextRequest } from "next/server";
import {
  createBiAgentReadableStream,
  isBiAgentDebugLogsEnabled,
} from "@/lib/biChatRunner";

export const runtime = "nodejs";
/** Vercel Pro: hasta 300s; consultas BI complejas (top 10 crecimiento) pueden tardar ~2 min. */
export const maxDuration = 300;

/** Endpoint del chat UI (prioriza velocidad; sync es opcional en /api/bi). */
export async function POST(req: NextRequest) {
  let body: { messages?: ChatCompletionMessageParam[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming = body.messages ?? [];
  if (!incoming.length) {
    return new Response(JSON.stringify({ error: "messages requerido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cookieName = "cora_session";
  const fromCookie = req.cookies.get(cookieName)?.value?.trim();
  const sessionId =
    fromCookie && fromCookie.length >= 16
      ? fromCookie
      : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  if (isBiAgentDebugLogsEnabled()) {
    console.info("[BI agent] POST /api/chat", {
      sessionId,
      messages: incoming.length,
    });
  }

  const stream = createBiAgentReadableStream({
    messages: incoming,
    syncFirst: false,
    sessionId,
  });

  const res = new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
  if (!fromCookie) {
    res.headers.append(
      "Set-Cookie",
      `${cookieName}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=2592000; SameSite=Lax`
    );
  }
  return res;
}
