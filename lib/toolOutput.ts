/**
 * Evita que un único tool output reviente el contexto del modelo (~16k tokens en 3.5).
 */
const DEFAULT_MAX = 45_000;

export function capToolOutputJson(payload: unknown): string {
  const parsed = parseInt(
    process.env.TOOL_OUTPUT_MAX_CHARS || String(DEFAULT_MAX),
    10
  );
  const maxLen = Math.min(
    200_000,
    Math.max(8_000, Number.isFinite(parsed) ? parsed : DEFAULT_MAX)
  );

  const text = JSON.stringify(payload);
  if (text.length <= maxLen) return text;

  const o = payload as {
    rows?: Record<string, unknown>[];
    rowCount?: number;
    truncated?: boolean;
    [k: string]: unknown;
  };
  const rows = Array.isArray(o.rows) ? [...o.rows] : [];
  while (rows.length > 1 && JSON.stringify({ ...o, rows }).length > maxLen) {
    rows.pop();
  }
  return JSON.stringify({
    ...o,
    rows,
    rowCount: rows.length,
    truncated: true,
    note: "Resultado recortado por límite de tamaño para el modelo; usa agregaciones (SUM/GROUP BY) o PERIODO más acotado.",
  });
}
