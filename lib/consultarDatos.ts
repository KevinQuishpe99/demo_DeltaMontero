import { queryRows } from "@/lib/db";
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
import {
  buildEmergencyVentasPayload,
  buildFallbackMetaVentasByYear,
  runSqlWithAutoRetry,
} from "@/lib/sqlExecuteRetry";

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

  const raw = await queryRows(safeSql);
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

/** SELECT validado contra la skill BI; reintenta SQL y usa respaldo si falla. */
export async function runConsultarDatosForSkill(
  sql: string,
  gate: SkillGate,
  skillName: BiSkillToolName = "consultar_comercial"
): Promise<string> {
  const retry = await runSqlWithAutoRetry(gate, sql);
  if (retry.ok) {
    return executeConsultarDatos(retry.sqlUsed, skillName);
  }

  const emergencySql = assertSafeSelectForBiSkill(
    gate,
    buildFallbackMetaVentasByYear([2025, 2024, 2023, 2022])
  );
  try {
    const raw = await queryRows(emergencySql);
    const note =
      raw.length === 0
        ? "Consulta de respaldo sin filas; indica cobertura según METADATA (años disponibles)."
        : "Resultado vía consulta de respaldo automática (el SQL original no era válido en Postgres).";
    return buildEmergencyVentasPayload(skillName, emergencySql, raw, note);
  } catch {
    return buildEmergencyVentasPayload(
      skillName,
      emergencySql,
      [],
      "Sin filas en meta_venta_neta para los años pedidos; responde con años disponibles del METADATA del sistema."
    );
  }
}
