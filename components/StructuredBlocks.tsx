"use client";

import type { Components } from "react-markdown";
import {
  Children,
  isValidElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CoraChart } from "@/components/CoraChart";
import { SmartChart, type SmartChartSpec } from "@/components/SmartChart";

export type StructuredTone = "light" | "dark";

type TableSpec = {
  type: "table";
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
};

type ChartSpec = {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  data: Record<string, unknown>[];
  xKey: string;
  series: { key: string; name: string; color?: string }[];
};

/** Bloque emitido por el modelo: descarga CSV o Excel (.xlsx) desde el servidor. */
type ExportDataSpec = {
  type: "exportData" | "exportCsv";
  skill: string;
  sql: string;
  fileName?: string;
  title?: string;
  rowCountExpected?: number;
  chunkSize?: number;
  chunked?: boolean;
};

function isTableSpec(x: unknown): x is TableSpec {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "table" &&
    Array.isArray(o.columns) &&
    Array.isArray(o.rows)
  );
}

function isChartSpec(x: unknown): x is ChartSpec {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "chart" &&
    (o.chartType === "bar" || o.chartType === "line" || o.chartType === "pie") &&
    Array.isArray(o.data) &&
    typeof o.xKey === "string" &&
    Array.isArray(o.series)
  );
}

/** Normaliza `type` en cualquier casing y devuelve un spec listo para la API de exportación. */
function toExportDataSpec(x: unknown): ExportDataSpec | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const tyRaw =
    typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  if (
    (tyRaw !== "exportdata" && tyRaw !== "exportcsv") ||
    typeof o.skill !== "string" ||
    typeof o.sql !== "string"
  ) {
    return null;
  }
  const spec: ExportDataSpec = {
    type: tyRaw === "exportcsv" ? "exportCsv" : "exportData",
    skill: o.skill,
    sql: o.sql,
  };
  if (typeof o.fileName === "string" && o.fileName.trim())
    spec.fileName = o.fileName.trim();
  if (typeof o.title === "string" && o.title.trim()) spec.title = o.title.trim();
  if (typeof o.rowCountExpected === "number" && Number.isFinite(o.rowCountExpected))
    spec.rowCountExpected = o.rowCountExpected;
  if (typeof o.chunkSize === "number" && Number.isFinite(o.chunkSize))
    spec.chunkSize = o.chunkSize;
  if (typeof o.chunked === "boolean") spec.chunked = o.chunked;
  return spec;
}

function tryLenientJsonExport(raw: string): ExportDataSpec | null {
  const t = raw.trim();
  const attempts = [t, t.replace(/\r\n/g, "\n"), t.replace(/,\s*([\]}])/g, "$1")];
  for (const a of attempts) {
    try {
      const parsed: unknown = JSON.parse(a);
      const exp = toExportDataSpec(parsed);
      if (exp) return exp;
    } catch {
      /* siguiente intento */
    }
  }
  return null;
}

/** Quita fences ```json … ``` sueltos para que no pasen al Markdown (evita caja de código). */
function stripEmbeddedJsonFences(s: string): string {
  return s
    .replace(/```\s*json\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstPreChildIsJsonFence(children: ReactNode): boolean {
  const first = Children.toArray(children)[0];
  if (!isValidElement(first)) return false;
  const cls = (first.props as { className?: string }).className ?? "";
  return /language-json\b/i.test(cls);
}

function markdownPreLight({ children }: { children?: ReactNode }) {
  if (firstPreChildIsJsonFence(children ?? null)) return null;
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
      {children}
    </pre>
  );
}

function markdownPreDark({ children }: { children?: ReactNode }) {
  if (firstPreChildIsJsonFence(children ?? null)) return null;
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300">
      {children}
    </pre>
  );
}

function isSmartChartSpec(x: unknown): x is SmartChartSpec {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.type === "smartChart" &&
    Array.isArray(o.data) &&
    typeof o.xKey === "string" &&
    Array.isArray(o.series)
  );
}

function StreamBlockPending() {
  return (
    <div
      className="my-3 flex items-center gap-2 text-sm text-neutral-500"
      role="status"
      aria-live="polite"
      aria-label="Preparando respuesta"
    >
      <span className="thinking-dots" aria-hidden>
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      <span>Preparando tabla o gráfico…</span>
    </div>
  );
}

/** Durante el stream, no mostrar fences ``` abiertos (evita “pantalla negra” con código). */
function stripIncompleteFences(
  text: string,
  active: boolean
): { visible: string; pending: boolean } {
  if (!active || !text) return { visible: text, pending: false };
  const n = (text.match(/```/g) ?? []).length;
  if (n % 2 === 0) return { visible: text, pending: false };
  const last = text.lastIndexOf("```");
  const visible = text.slice(0, last).trimEnd();
  return { visible, pending: true };
}

function ExportDataDownload({
  spec,
  tone,
}: {
  spec: ExportDataSpec;
  tone: StructuredTone;
}) {
  const [busy, setBusy] = useState<null | "csv" | "xlsx">(null);
  const [err, setErr] = useState<string | null>(null);
  const isLight = tone === "light";
  const linkCls =
    isLight
      ? "font-medium text-teal-700 underline decoration-teal-600/40 underline-offset-2 hover:text-teal-800 disabled:opacity-45"
      : "font-medium text-teal-400 underline decoration-teal-500/40 underline-offset-2 hover:text-teal-300 disabled:opacity-45";

  const download = useCallback(
    async (format: "csv" | "xlsx") => {
      setErr(null);
      setBusy(format);
      try {
        const res = await fetch("/api/export-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skill: spec.skill,
            sql: spec.sql,
            format,
            ...(spec.chunkSize != null ? { chunkSize: spec.chunkSize } : {}),
            ...(spec.chunked === false ? { chunked: false } : {}),
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          try {
            const j = JSON.parse(t) as { error?: string };
            throw new Error(j.error || res.statusText);
          } catch {
            throw new Error(t || res.statusText);
          }
        }
        const blob = await res.blob();
        const rawBase =
          spec.fileName?.trim().replace(/\.(csv|xlsx)$/i, "") ||
          `cora-export-${Date.now()}`;
        const name =
          format === "xlsx" ? `${rawBase}.xlsx` : `${rawBase}.csv`;
        downloadBlob(blob, name);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error al descargar");
      } finally {
        setBusy(null);
      }
    },
    [spec.skill, spec.sql, spec.fileName, spec.chunkSize, spec.chunked]
  );

  return (
    <div className="my-3 border-b border-neutral-200 pb-3">
      {spec.title ? (
        <p className="text-sm font-medium text-neutral-900">{spec.title}</p>
      ) : null}
      {spec.rowCountExpected != null ? (
        <p className="mt-0.5 text-xs text-neutral-600">
          {spec.rowCountExpected.toLocaleString("es-EC")} filas
        </p>
      ) : null}
      <p className="mt-2 text-sm text-neutral-800">
        <button
          type="button"
          className={linkCls}
          disabled={busy !== null}
          onClick={() => download("csv")}
        >
          {busy === "csv" ? "Generando…" : "CSV"}
        </button>
        <span className="mx-1.5 text-neutral-400">·</span>
        <button
          type="button"
          className={linkCls}
          disabled={busy !== null}
          onClick={() => download("xlsx")}
        >
          {busy === "xlsx" ? "Generando…" : "Excel"}
        </button>
      </p>
      {err ? (
        <p className={`mt-2 text-xs ${isLight ? "text-red-700" : "text-red-400"}`}>{err}</p>
      ) : null}
    </div>
  );
}

function DataTableView({
  spec,
  tone,
}: {
  spec: TableSpec;
  tone: StructuredTone;
}) {
  if (!spec.columns.length) return null;
  const isLight = tone === "light";
  const btnCls =
    "flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-95";
  return (
    <div className="my-4">
      <div
        className={
          isLight
            ? "overflow-x-auto rounded-lg border border-neutral-200 bg-white"
            : "overflow-x-auto rounded-lg border border-zinc-700/80 bg-zinc-950/50"
        }
      >
        <table className="min-w-full text-left text-sm">
          <thead
            className={
              isLight
                ? "border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600"
                : "border-b border-zinc-700 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-400"
            }
          >
            <tr>
              {spec.columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={
              isLight
                ? "divide-y divide-neutral-200 text-neutral-800"
                : "divide-y divide-zinc-800 text-zinc-200"
            }
          >
            {spec.rows.slice(0, 200).map((row, i) => (
              <tr
                key={i}
                className={
                  isLight ? "hover:bg-neutral-50" : "hover:bg-zinc-800/40"
                }
              >
                {spec.columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2">
                    {formatCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p
          className={
            isLight
              ? "border-t border-neutral-200 px-3 py-2 text-xs text-neutral-600"
              : "border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500"
          }
        >
          {spec.rows.length > 200
            ? `Mostrando 200 de ${spec.rows.length} filas en esta tabla.`
            : `${spec.rows.length} fila${spec.rows.length === 1 ? "" : "s"} en esta tabla.`}
        </p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          className={btnCls}
          onClick={() => exportTableAsCsv(spec)}
          title="Descargar tabla como CSV"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          CSV
        </button>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return v.toLocaleString("es-EC", { maximumFractionDigits: 2 });
  }
  return String(v);
}

/* ── Download helpers ──────────────────────────────────────────────── */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/* ── Table download ──────────────────────────────────────────────── */

function exportTableAsCsv(spec: TableSpec) {
  const headers = spec.columns.map((c) => c.label);
  const rows = spec.rows.map((row) =>
    spec.columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined) return "";
      return String(v);
    }),
  );
  const csv = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `tabla-cora-${Date.now()}.csv`);
}

function ChartView({ spec }: { spec: ChartSpec }) {
  return <CoraChart spec={spec} />;
}

const markdownLight: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-pretty text-neutral-800 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-neutral-800">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-neutral-800">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-neutral-800">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-base font-semibold tracking-tight text-neutral-900 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-sm font-semibold text-neutral-900 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-sm font-medium text-neutral-900">
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-neutral-300 pl-3 text-neutral-600">
      {children}
    </blockquote>
  ),
  code: (props) => {
    const { children, className } = props;
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[0.9em] text-neutral-800">{children}</code>
    );
  },
  pre: markdownPreLight,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[320px] border-collapse text-left text-sm text-neutral-800">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-neutral-200 bg-neutral-50">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-neutral-200 px-3 py-2 align-top">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="odd:bg-white even:bg-neutral-50/80">{children}</tr>
  ),
  hr: () => <hr className="my-4 border-neutral-200" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-teal-700 underline decoration-teal-600/40 underline-offset-2 hover:text-teal-600"
    >
      {children}
    </a>
  ),
};

const markdownDark: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-pretty last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-50">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-zinc-100">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-base font-semibold tracking-tight text-zinc-50 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-sm font-semibold text-zinc-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-sm font-medium text-zinc-100">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-zinc-600 pl-3 text-zinc-400">
      {children}
    </blockquote>
  ),
  code: (props) => {
    const { children, className } = props;
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-sky-200">
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[0.9em] text-zinc-200">{children}</code>
    );
  },
  pre: markdownPreDark,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-zinc-700/80 bg-zinc-950/40">
      <table className="w-full min-w-[320px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-700 bg-zinc-900/90">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-700 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-800 px-3 py-2 align-top text-zinc-200">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="odd:bg-zinc-950/60 even:bg-zinc-900/25">{children}</tr>
  ),
  hr: () => <hr className="my-4 border-zinc-700" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-sky-400 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-300"
    >
      {children}
    </a>
  ),
};

function MarkdownAnswer({
  source,
  tone,
}: {
  source: string;
  tone: StructuredTone;
}) {
  const components = tone === "light" ? markdownLight : markdownDark;
  const textCls =
    tone === "light"
      ? "min-w-0 text-sm leading-relaxed text-neutral-800"
      : "min-w-0 text-sm leading-relaxed text-zinc-200";
  return (
    <div className={textCls}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

const JSON_BLOCK = /```\s*json\s*([\s\S]*?)```/gi;

export function StructuredBlocks({
  content,
  tone = "light",
  isStreaming = false,
}: {
  content: string;
  tone?: StructuredTone;
  /** Mientras llega el stream: oculta fences abiertos y JSON incompleto (sin bloque negro con código). */
  isStreaming?: boolean;
}) {
  if (!content?.trim()) return null;

  const { visible: contentForParse, pending: fencePending } =
    stripIncompleteFences(content, isStreaming);

  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(JSON_BLOCK.source, JSON_BLOCK.flags);
  let key = 0;
  const softMsgCls =
    tone === "light" ? "text-sm text-neutral-500" : "text-sm text-zinc-400";

  while ((m = re.exec(contentForParse)) !== null) {
    const before = contentForParse.slice(last, m.index);
    const beforeMd = stripEmbeddedJsonFences(before.trim());
    if (beforeMd) {
      parts.push(
        <MarkdownAnswer key={`t-${key++}`} source={beforeMd} tone={tone} />
      );
    }
    const raw = m[1]?.trim() ?? "";
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isTableSpec(parsed)) {
        parts.push(
          <DataTableView key={`tbl-${key++}`} spec={parsed} tone={tone} />
        );
      } else if (isSmartChartSpec(parsed)) {
        parts.push(<SmartChart key={`sm-${key++}`} spec={parsed} />);
      } else if (isChartSpec(parsed)) {
        parts.push(<ChartView key={`ch-${key++}`} spec={parsed} />);
      } else {
        const exportSpec = toExportDataSpec(parsed);
        if (exportSpec) {
          parts.push(
            <ExportDataDownload
              key={`exp-${key++}`}
              spec={exportSpec}
              tone={tone}
            />
          );
        } else if (isStreaming) {
          parts.push(<StreamBlockPending key={`raw-${key++}`} />);
        } else {
          parts.push(
            <p key={`raw-${key++}`} className={softMsgCls}>
              Bloque de datos no reconocido.
            </p>
          );
        }
      }
    } catch {
      const recovered = tryLenientJsonExport(raw);
      if (recovered) {
        parts.push(
          <ExportDataDownload key={`exp-${key++}`} spec={recovered} tone={tone} />
        );
      } else if (isStreaming) {
        parts.push(<StreamBlockPending key={`bad-${key++}`} />);
      } else {
        parts.push(
          <p key={`bad-${key++}`} className={softMsgCls}>
            No se pudo preparar la exportación. Vuelve a pedir el listado.
          </p>
        );
      }
    }
    last = m.index + m[0].length;
  }

  const tail = stripEmbeddedJsonFences(contentForParse.slice(last).trim());
  if (tail) {
    parts.push(
      <MarkdownAnswer key={`t-${key++}`} source={tail} tone={tone} />
    );
  }

  if (fencePending) {
    parts.push(<StreamBlockPending key={`fence-${key++}`} />);
  }

  return <div className="flex flex-col gap-3">{parts}</div>;
}
