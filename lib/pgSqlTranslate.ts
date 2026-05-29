/**
 * Traduce SELECT generados para SQL Server (prompts BI) a PostgreSQL (Montero_db).
 */
export function translateMssqlToPostgres(sql: string): string {
  let s = sql;

  s = s.replace(/\s+WITH\s*\(\s*NOLOCK\s*\)/gi, "");
  s = s.replace(/\bWITH\s*\(\s*NOLOCK\s*\)/gi, "");

  s = s.replace(
    /\[banda\]\.\[dbo\]\.\[([A-Za-z_][A-Za-z0-9_]*)\]/gi,
    (_, table: string) => `public.${table.toLowerCase()}`
  );
  s = s.replace(
    /\[dbo\]\.\[([A-Za-z_][A-Za-z0-9_]*)\]/gi,
    (_, table: string) => `public.${table.toLowerCase()}`
  );
  s = s.replace(
    /\bdbo\.([A-Za-z_][A-Za-z0-9_]*)\b/gi,
    (_, table: string) => `public.${table.toLowerCase()}`
  );

  s = s.replace(/\[([^\]]+)\]/g, (_, id: string) => id);

  s = s.replace(
    /\bOFFSET\s+(\d+)\s+ROWS\s+FETCH\s+NEXT\s+(\d+)\s+ROWS\s+ONLY\b/gi,
    "OFFSET $1 LIMIT $2"
  );

  s = s.replace(/\bGETDATE\s*\(\s*\)/gi, "CURRENT_TIMESTAMP");
  s = s.replace(
    /\bFORMAT\s*\(\s*CURRENT_TIMESTAMP\s*,\s*'yyyyMM'\s*\)/gi,
    "TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMM')"
  );
  s = s.replace(
    /\bFORMAT\s*\(\s*GETDATE\s*\(\s*\)\s*,\s*'yyyyMM'\s*\)/gi,
    "TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMM')"
  );

  s = s.replace(/\bISNULL\s*\(/gi, "COALESCE(");

  const topMatch = /\bSELECT\s+TOP\s+(\d+)\b/i.exec(s);
  if (topMatch) {
    const n = topMatch[1];
    s = s.replace(/\bSELECT\s+TOP\s+\d+\b/i, "SELECT");
    if (!/\bLIMIT\s+\d+\b/i.test(s)) {
      s = s.replace(/;+\s*$/g, "");
      s = `${s.trimEnd()} LIMIT ${n}`;
    }
  }

  return s.trim();
}
