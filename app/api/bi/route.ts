import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NextRequest } from "next/server";
import {
  createBiAgentReadableStream,
  isBiAgentDebugLogsEnabled,
} from "@/lib/biChatRunner";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/bi?q=...&sync=1 — una pregunta puntual (sin historial).
 * POST /api/bi — { messages, sync?: boolean } (sync default false = más rápido).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return new Response(JSON.stringify({ error: "Parámetro q requerido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sync =
    req.nextUrl.searchParams.get("sync") === "1" ||
    req.nextUrl.searchParams.get("sync") === "true";

  const messages: ChatCompletionMessageParam[] = [
    { role: "user", content: q },
  ];

  const cookieName = "cora_session";
  const fromCookie = req.cookies.get(cookieName)?.value?.trim();
  const sessionId =
    fromCookie && fromCookie.length >= 16
      ? fromCookie
      : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  if (isBiAgentDebugLogsEnabled()) {
    console.info("[BI agent] GET /api/bi", {
      sessionId,
      syncFirst: sync,
      qPreview: q.slice(0, 120),
    });
  }

  const stream = createBiAgentReadableStream({
    messages,
    syncFirst: sync,
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

export async function POST(req: NextRequest) {
  let body: {
    messages?: ChatCompletionMessageParam[];
    sync?: boolean;
  };
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

  const syncFirst = body.sync === true;
  const cookieName = "cora_session";
  const fromCookie = req.cookies.get(cookieName)?.value?.trim();
  const sessionId =
    fromCookie && fromCookie.length >= 16
      ? fromCookie
      : globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  if (isBiAgentDebugLogsEnabled()) {
    console.info("[BI agent] POST /api/bi", {
      sessionId,
      syncFirst,
      messages: incoming.length,
    });
  }

  const stream = createBiAgentReadableStream({
    messages: incoming,
    syncFirst,
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
