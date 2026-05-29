"use client";

import Image from "next/image";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "@/components/chat-panel.module.css";
import { StructuredBlocks } from "@/components/StructuredBlocks";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";

type Role = "user" | "assistant";

export type ChatMessage = { role: Role; content: string };

const MAX_MESSAGES_TO_API = 24;
const AUTO_SCROLL_STORAGE_KEY = "cora_auto_scroll";

function readAutoScrollPref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_SCROLL_STORAGE_KEY) === "1";
}

/** Quita estados intermedios del stream; la UI usa los tres puntos en su lugar. */
function stripInterimStatus(text: string): string {
  return text
    .replace(/_\s*Procesando tu consulta[^_]*_\s*/gi, "")
    .replace(/_\s*Consultando base de datos[^_]*_\s*/gi, "")
    .trim();
}

/** Texto de respuesta real (sin SQL ni estados de espera). */
function visibleAnswerText(content: string): string {
  return stripInterimStatus(content)
    .replace(/```sql[\s\S]*?```/gi, "")
    .replace(/\*\*Consulta SQL\*\*[^\n]*/gi, "")
    .trim();
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const touchStartYRef = useRef(0);

  useEffect(() => {
    setAutoScroll(readAutoScrollPref());
  }, []);

  const LINE_HEIGHT_PX = 24;
  const INPUT_MAX_LINES = 3;
  const inputMaxHeightPx =
    LINE_HEIGHT_PX * INPUT_MAX_LINES + 32; /* padding vertical del textarea */

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, inputMaxHeightPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > inputMaxHeightPx ? "auto" : "hidden";
  }, [inputMaxHeightPx]);
  /** Se incrementa en cada "Nuevo chat" para ignorar streams de la conversación anterior. */
  const chatGenerationRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const scheduleScrollToBottom = useCallback(() => {
    if (!stickToBottomRef.current) return;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = messagesContainerRef.current;
      if (!el || !stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
      setShowJumpToBottom(false);
    });
  }, []);

  useEffect(() => {
    const onNew = () => {
      chatGenerationRef.current += 1;
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
      setMessages([]);
      setInput("");
      setError(null);
      setLoading(false);
      setShowJumpToBottom(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = "auto";
          el.style.overflowY = "hidden";
        }
      });
    };
    window.addEventListener("newChatStarted", onNew);
    return () => window.removeEventListener("newChatStarted", onNew);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        AUTO_SCROLL_STORAGE_KEY,
        autoScroll ? "1" : "0"
      );
    }
    stickToBottomRef.current = autoScroll;
    if (autoScroll) scheduleScrollToBottom();
  }, [autoScroll, scheduleScrollToBottom]);

  const jumpToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJumpToBottom(false);
    if (autoScroll) stickToBottomRef.current = true;
  }, [autoScroll]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const syncPinned = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distance < 48;
      setShowJumpToBottom(!atBottom);
      if (autoScroll) {
        stickToBottomRef.current = atBottom;
      }
    };

    const unpin = () => {
      if (!autoScroll) return;
      stickToBottomRef.current = false;
      setShowJumpToBottom(true);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) unpin();
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y - touchStartYRef.current > 8) unpin();
    };

    el.addEventListener("scroll", syncPinned, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      el.removeEventListener("scroll", syncPinned);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [hasMessages, autoScroll]);

  const lastAssistantContent =
    messages[messages.length - 1]?.role === "assistant"
      ? messages[messages.length - 1].content
      : "";

  const showThinking =
    loading && !visibleAnswerText(lastAssistantContent);

  useEffect(() => {
    if (loading && autoScroll && stickToBottomRef.current) {
      scheduleScrollToBottom();
    }
  }, [messages, loading, autoScroll, scheduleScrollToBottom]);

  useEffect(() => {
    syncTextareaHeight();
  }, [input, syncTextareaHeight]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const generationAtSend = chatGenerationRef.current;

    setError(null);
    setInput("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.overflowY = "hidden";
      }
    });
    const nextUser: ChatMessage = { role: "user", content: text };
    const history = [...messages, nextUser];
    setMessages([...history, { role: "assistant", content: "" }]);
    setLoading(true);
    if (autoScroll) stickToBottomRef.current = true;

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    try {
      const recent = history.slice(-MAX_MESSAGES_TO_API);
      const apiMessages = recent.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: ac.signal,
      });

      if (chatGenerationRef.current !== generationAtSend) {
        return;
      }

      const ctype = res.headers.get("content-type") || "";

      if (!res.ok) {
        if (ctype.includes("application/json")) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error || res.statusText);
        }
        throw new Error(await res.text());
      }

      if (!ctype.includes("text/plain")) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error || "Respuesta inesperada");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sin cuerpo de respuesta");

      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (chatGenerationRef.current !== generationAtSend) {
          await reader.cancel().catch(() => {});
          break;
        }
        acc += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
        scheduleScrollToBottom();
      }

      if (chatGenerationRef.current === generationAtSend) {
        scheduleScrollToBottom();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (chatGenerationRef.current !== generationAtSend) {
        return;
      }
      const msg = err instanceof Error ? err.message : "Error de red";
      setError(msg);
      setMessages(history);
    } finally {
      if (
        chatGenerationRef.current === generationAtSend &&
        fetchAbortRef.current === ac
      ) {
        fetchAbortRef.current = null;
      }
      if (chatGenerationRef.current === generationAtSend) {
        setLoading(false);
      }
    }
  };

  const hasConversation = messages.length > 0 || loading;

  return (
    <div className={styles.chatContainer}>
      {!hasConversation && (
        <div className={styles.welcomeContainer}>
          <div className={styles.welcomeText}>
            <div className={styles.logoWrapper}>
              <Image
                src="/logo-cora.png"
                alt="Logo CORA"
                width={80}
                height={80}
                className={styles.logoImage}
              />
            </div>
            <h1 className={styles.assistantName}>Cora</h1>
            <p className={styles.assistantRole}>Inteligencia de negocio</p>
            <div className={styles.description}>
              <p>
                Consultas sobre ventas, inventario, cartera y más ....
              </p>
             
            </div>
          </div>
        </div>
      )}

      {hasConversation && (
        <>
          <div
            className={styles.messagesViewport}
            ref={messagesContainerRef}
          >
            <div className={styles.messagesInner}>
              {messages.map((m, i) => (
                <div key={i} data-role={m.role}>
                  {m.role === "user" ? (
                    <div className={styles.userMessage}>{m.content}</div>
                  ) : stripInterimStatus(m.content).trim() ? (
                    <div className={styles.assistantMessage}>
                      <StructuredBlocks
                        content={stripInterimStatus(m.content)}
                        tone="light"
                        isStreaming={
                          loading &&
                          i === messages.length - 1 &&
                          m.role === "assistant"
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              {showThinking && (
                <div data-role="assistant">
                  <ThinkingIndicator />
                </div>
              )}
              {error && (
                <div data-role="assistant">
                  <div className={styles.assistantMessage}>{error}</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.scrollToolbar}>
            <button
              type="button"
              className={
                autoScroll
                  ? styles.autoScrollToggleOn
                  : styles.autoScrollToggle
              }
              onClick={toggleAutoScroll}
              aria-pressed={autoScroll}
              title={
                autoScroll
                  ? "Desactivar scroll automático mientras responde"
                  : "Seguir la respuesta en vivo (scroll automático)"
              }
            >
              <span className={styles.autoScrollDot} aria-hidden />
              Scroll automático
            </button>
            {showJumpToBottom && (
              <button
                type="button"
                className={styles.jumpToBottom}
                onClick={jumpToBottom}
              >
                Ir al final ↓
              </button>
            )}
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={styles.inputForm}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escribe tu pregunta aquí..."
            disabled={loading}
            autoComplete="off"
          />
          <button
            type="submit"
            className={styles.button}
            disabled={loading || !input.trim()}
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
