import type { BiSkillToolName } from "@/lib/biSkillTools";
import type { SkillGate } from "@/lib/sqlGuard";
import { assertSafeSelectForBiSkill } from "@/lib/sqlGuard";
import { translateMssqlToPostgres } from "@/lib/pgSqlTranslate";
import { isPostgresDb } from "@/lib/dbEnv";
import { queryRows } from "@/lib/db";

const MAX_ATTEMPTS = 4;

/** Años mencionados en el SQL (IN (...) o ANIO = 2025). */
export function extractYearsFromSql(sql: string): number[] {
  const years = new Set<number>();
  const inMatch = sql.match(/\bANIO\s+IN\s*\(\s*([^)]+)\)/i);
  if (inMatch) {
    for (const m of Array.from(inMatch[1].matchAll(/\b(20\d{2})\b/g))) {
      years.add(Number(m[1]));
    }
  }
  for (const m of Array.from(sql.matchAll(/\bANIO\s*=\s*(20\d{2})\b/gi))) {
    years.add(Number(m[1]));
  }
  for (const m of Array.from(sql.matchAll(/\b(20\d{2})\b/g))) {
    years.add(Number(m[1]));
  }
  return Array.from(years).sort((a, b) => a - b);
}

function extractTrimestresFromSql(sql: string): number[] {
  const t = new Set<number>();
  const inMatch = sql.match(/\bTRIMESTRE\s+IN\s*\(\s*([^)]+)\)/i);
  if (inMatch) {
    for (const m of Array.from(inMatch[1].matchAll(/\b([1-4])\b/g))) {
      t.add(Number(m[1]));
    }
  }
  const eq = sql.match(/\bTRIMESTRE\s*=\s*([1-4])\b/i);
  if (eq) t.add(Number(eq[1]));
  return Array.from(t);
}

export function buildFallbackMetaVentasByYear(years: number[]): string {
  const list = years.length ? years.join(", ") : "2025, 2024, 2023, 2022";
  return [
    "SELECT ANIO,",
    "  SUM(VENTA_NETA) AS VENTA_NETA,",
    "  SUM(UTILIDAD) AS UTILIDAD,",
    "  COUNT(*) AS REGISTROS",
    "FROM dbo.meta_venta_neta WITH (NOLOCK)",
    `WHERE ANIO IN (${list})`,
    "GROUP BY ANIO",
    "ORDER BY ANIO",
  ].join("\n");
}

export function buildFallbackMetaVentasTrimestre(
  years: number[],
  trimestres: number[]
): string {
  const yList = years.length ? years.join(", ") : "2025, 2024, 2023";
  const tList = trimestres.length ? trimestres.join(", ") : "1";
  return [
    "SELECT ANIO, TRIMESTRE,",
    "  SUM(VENTA_NETA) AS VENTA_NETA,",
    "  SUM(UTILIDAD) AS UTILIDAD",
    "FROM dbo.meta_venta_neta WITH (NOLOCK)",
    `WHERE TRIMESTRE IN (${tList}) AND ANIO IN (${yList})`,
    "GROUP BY ANIO, TRIMESTRE",
    "ORDER BY ANIO, TRIMESTRE",
  ].join("\n");
}

/** Ajustes extra según mensaje de error de Postgres. */
export function repairSqlFromError(sql: string, errMsg: string): string {
  let s = sql;
  const msg = errMsg.toLowerCase();

  if (msg.includes("year") || msg.includes("convert")) {
    s = translateMssqlToPostgres(s);
  }
  if (msg.includes("convert")) {
    s = s.replace(
      /\bCONVERT\s*\(\s*VARCHAR\s*\(\s*\d+\s*\)\s*,\s*([^,)]+)(?:\s*,\s*\d+)?\s*\)/gi,
      "CAST($1 AS VARCHAR)"
    );
  }
  if (msg.includes("nolock") || msg.includes("syntax error")) {
    s = translateMssqlToPostgres(s);
  }
  if (msg.includes("dbo.") || msg.includes("relation")) {
    s = translateMssqlToPostgres(s);
  }

  return s.trim();
}

function uniqueSqlVariants(original: string): string[] {
  const years = extractYearsFromSql(original);
  const trimestres = extractTrimestresFromSql(original);
  const list: string[] = [original];

  if (trimestres.length || /\btrimestre\b/i.test(original)) {
    list.push(
      buildFallbackMetaVentasTrimestre(
        years.length ? years : [2025, 2024, 2023],
        trimestres.length ? trimestres : [1]
      )
    );
  }

  list.push(
    buildFallbackMetaVentasByYear(years.length ? years : [2025, 2024, 2023, 2022])
  );
  list.push(buildFallbackMetaVentasByYear([2025, 2024, 2023, 2022, 2021]));

  if (isPostgresDb()) {
    list.push(translateMssqlToPostgres(original));
    list.push(
      translateMssqlToPostgres(
        buildFallbackMetaVentasByYear(years.length ? years : [2025])
      )
    );
  }

  const seen = new Set<string>();
  return list.filter((q) => {
    const k = q.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function probeSql(gate: SkillGate, sql: string): Promise<void> {
  const safe = assertSafeSelectForBiSkill(gate, sql);
  await queryRows(safe);
}

/**
 * Ejecuta consulta con reintentos y SQL de respaldo (nunca lanza al agente).
 */
export async function runSqlWithAutoRetry(
  gate: SkillGate,
  sql: string
): Promise<{ ok: true; sqlUsed: string } | { ok: false; lastError: string }> {
  const variants = uniqueSqlVariants(sql);
  let lastError = "";

  for (let i = 0; i < Math.min(variants.length, MAX_ATTEMPTS); i++) {
    const candidate = variants[i]!;
    try {
      await probeSql(gate, candidate);
      return { ok: true, sqlUsed: assertSafeSelectForBiSkill(gate, candidate) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const repaired = repairSqlFromError(candidate, lastError);
      if (repaired !== candidate) {
        try {
          await probeSql(gate, repaired);
          return {
            ok: true,
            sqlUsed: assertSafeSelectForBiSkill(gate, repaired),
          };
        } catch (err2) {
          lastError = err2 instanceof Error ? err2.message : String(err2);
        }
      }
    }
  }

  return { ok: false, lastError };
}

export function buildEmergencyVentasPayload(
  skill: BiSkillToolName,
  sqlUsed: string,
  rows: Record<string, unknown>[],
  note: string
): string {
  return JSON.stringify({
    rows,
    rowCount: rows.length,
    sourceRowsAfterSqlCap: rows.length,
    truncated: false,
    sqlAiMaxRows: 20,
    businessTotal: rows.length,
    ejecutadoSql: sqlUsed,
    autoRetry: true,
    coverageNote: note,
    listadoUiEs:
      "Responder con cifras del JSON rows. Si VENTA_NETA es 0 o no hay fila para un año pedido, dilo explícito con coverageNote. Incluye chart si pidieron comparativo. Prohibido mencionar errores de conexión o SQL.",
    skill,
  });
}
