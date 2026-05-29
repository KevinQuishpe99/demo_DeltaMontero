import { queryRows } from "@/lib/db";
import {
  assertSafeSelectForBiSkill,
  type SkillGate,
} from "@/lib/sqlGuard";
import {
  BI_SKILL_GATES,
  type BiSkillToolName,
} from "@/lib/biSkillTools";

function envInt(name: string, fallback: number, min: number, max: number) {
  const v = parseInt(process.env[name] || String(fallback), 10);
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

export const EXPORT_MAX_ROWS = envInt(
  "SQL_EXPORT_MAX_ROWS",
  50_000,
  100,
  200_000
);

const CHUNK_DEFAULT = envInt("SQL_EXPORT_CHUNK_SIZE", 3000, 200, 10_000);

/** TOP / OFFSET / FETCH ya presentes → una sola ida (no duplicar paginación). */
function hasExplicitLimitOrPaging(sql: string): boolean {
  const u = sql.replace(/\s+/g, " ").toUpperCase();
  if (/\bTOP\s+\d+/i.test(sql)) return true;
  if (/\bTOP\s*\(\s*\d+\s*\)/i.test(sql)) return true;
  if (/\bOFFSET\s+\d+\s+ROWS\b/i.test(u)) return true;
  if (/\bFETCH\s+NEXT\s+\d+/i.test(u)) return true;
  return false;
}

export type RunExportRowsOptions = {
  chunked?: boolean;
  chunkSize?: number;
};

/**
 * Ejecuta el SELECT (validado) y devuelve todas las filas acumuladas (paginación en servidor si aplica).
 */
export async function runExportRowsQuery(
  skill: BiSkillToolName,
  sql: string,
  options: RunExportRowsOptions = {}
): Promise<{
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  chunks: number;
}> {
  const gate: SkillGate = BI_SKILL_GATES[skill];
  const base = assertSafeSelectForBiSkill(gate, sql);

  const chunked = options.chunked !== false;
  const chunk = Math.min(
    10_000,
    Math.max(200, options.chunkSize ?? CHUNK_DEFAULT)
  );

  /** OFFSET/FETCH en SQL Server exige ORDER BY estable; sin él no se puede paginar bien. */
  const wantsChunked = chunked && !hasExplicitLimitOrPaging(base);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(base);
  const usePaging = wantsChunked && hasOrderBy;

  // Sin ORDER BY: una sola ejecución del SELECT (p. ej. 27 filas). Listados muy grandes
  // deberían llevar ORDER BY en el prompt para activar lotes y menor uso de memoria.

  const all: Record<string, unknown>[] = [];
  let chunks = 0;

  if (!usePaging) {
    const raw = await queryRows(base);
    const truncated = raw.length > EXPORT_MAX_ROWS;
    const rows = truncated ? raw.slice(0, EXPORT_MAX_ROWS) : raw;
    return {
      rows,
      rowCount: rows.length,
      truncated,
      chunks: 1,
    };
  }

  let offset = 0;
  while (all.length < EXPORT_MAX_ROWS) {
    const take = Math.min(chunk, EXPORT_MAX_ROWS - all.length);
    const paged = `${base} OFFSET ${offset} ROWS FETCH NEXT ${take} ROWS ONLY`;
    const batch = await queryRows(paged);
    chunks += 1;
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < take) break;
    offset += take;
  }

  const truncated = all.length >= EXPORT_MAX_ROWS;
  return {
    rows: all,
    rowCount: all.length,
    truncated,
    chunks,
  };
}
