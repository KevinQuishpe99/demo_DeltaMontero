import { getDB } from "@/lib/db";
import {
  assertSafeSelect,
  assertSafeSelectForBiSkill,
  getSqlAiMaxRowsForLlm,
  limitRows,
  limitRowsForLLM,
  type SkillGate,
} from "@/lib/sqlGuard";
import { capToolOutputJson } from "@/lib/toolOutput";
import { enrichListadoPayload } from "@/lib/listadoEnrichment";
import type { BiSkillToolName } from "@/lib/biSkillTools";

type CacheEntry = { at: number; value: string };

function sqlResultCacheTtlMs(): number {
  const raw = process.env.SQL_RESULT_CACHE_TTL_MS?.trim();
  const v = raw ? parseInt(raw, 10) : NaN;
  const n = Number.isFinite(v) ? v : 20_000;
  if (n <= 0) return 0;
  return Math.min(120_000, Math.max(5_000, n));
}

const cache = new Map<string, CacheEntry>();

async function executeConsultarDatos(
  safeSql: string,
  skill = "consultar_comercial"
): Promise<string> {
  const ttl = sqlResultCacheTtlMs();
  const now = Date.now();
  const cached = cache.get(safeSql);
  if (ttl > 0 && cached && now - cached.at <= ttl) {
    return cached.value;
  }

  const pool = await getDB();
  const result = await pool.request().query(safeSql);
  const raw = (result.recordset ?? []) as Record<string, unknown>[];
  const capped = limitRows(raw);
  const forModel = limitRowsForLLM(capped);
  const llmCap = getSqlAiMaxRowsForLlm();
  const truncated =
    raw.length > capped.length || capped.length > forModel.length;
  const enrichment = enrichListadoPayload(
    forModel,
    skill,
    safeSql,
    llmCap,
    truncated,
    capped.length
  );

  const listadoParts = [
    "Responder al usuario: (1) PRIMERA línea en texto = total de filas del resultado de negocio (N). Usa businessTotal del JSON si existe; si no, sourceRowsAfterSqlCap cuando truncated=true.",
    `(2) Si N > ${llmCap}: **prohibido** volcar tabla larga ni preguntar «¿quieres Excel/CSV?» — di en una frase que hay N filas y que el chat muestra hasta ${llmCap} de ejemplo; **incluye de inmediato** exportDataJsonBlock si no es null.`,
    `(3) Si exportDataJsonBlock no es null: copia ese bloque **literal** al final (botones CSV/Excel).`,
    `(4) Si el usuario solo pide Excel/CSV/archivo y ya hubo listado en el turno anterior: **no** ejecutes otro SQL ni repitas la tabla; reutiliza exportDataJsonBlock del historial.`,
  ];

  const payload = {
    rows: forModel,
    rowCount: forModel.length,
    sourceRowsAfterSqlCap: capped.length,
    truncated,
    sqlAiMaxRows: llmCap,
    businessTotal: enrichment.businessTotal,
    detalleRowsInSample: enrichment.detalleRowsInSample,
    exportDataTemplate: enrichment.exportDataTemplate,
    exportDataJsonBlock: enrichment.exportDataJsonBlock,
    listadoUiEs: listadoParts.join(" "),
  };
  const out = capToolOutputJson(payload);
  cache.set(safeSql, { at: now, value: out });
  if (cache.size > 200) {
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
  return out;
}

export async function runConsultarDatos(sql: string): Promise<string> {
  const safe = assertSafeSelect(sql);
  return executeConsultarDatos(safe, "consultar_comercial");
}

/** SELECT validado contra la skill BI (vistas GestionBI, META, y/o banda calificada). */
export async function runConsultarDatosForSkill(
  sql: string,
  gate: SkillGate,
  skillName: BiSkillToolName = "consultar_comercial"
): Promise<string> {
  const safe = assertSafeSelectForBiSkill(gate, sql);
  return executeConsultarDatos(safe, skillName);
}
