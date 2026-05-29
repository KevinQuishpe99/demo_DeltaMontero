/**
 * Auditoría completa Área A (A01–A10): pregunta + SQL referencia + resultado BD + respuesta IA.
 *
 * Uso:
 *   npm run test:audit-area-a
 *   npm run test:audit-area-a -- --ids=A01,A05
 *
 * Salida:
 *   audit-area-a-report.json
 *   audit-area-a-report.md
 */
import fs from "fs";
import path from "path";
import sql from "mssql";
import { fileURLToPath } from "url";
import { loadAppEnv } from "./load-env.mjs";
import { flattenCatalog } from "./preguntas-catalog.mjs";
import { buildAreaAReferences, USER_DEMO_SQL } from "./area-a-reference.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadAppEnv();

const BASE_URL = process.env.VALIDATE_BASE_URL || "http://localhost:3000";
const CHAT_TIMEOUT_MS = parseInt(process.env.VALIDATE_CHAT_TIMEOUT_MS || "240000", 10);
const TOLERANCE_PCT = parseFloat(process.env.VALIDATE_TOLERANCE_PCT || "3");

function parseArgs() {
  const ids = process.argv
    .find((a) => a.startsWith("--ids="))
    ?.split("=")[1]
    ?.split(",")
    .map((s) => s.trim());
  const replay = process.argv.includes("--replay");
  return { ids, replay };
}

function parseMoneyToken(raw) {
  const s = String(raw).replace(/\$/g, "").trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ""));
  return parseFloat(s.replace(/,/g, ""));
}

function extractNumbers(text) {
  const nums = [];
  const moneyRe =
    /(?:\$\s*|USD\s*)([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = moneyRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[0]);
    if (Number.isFinite(v) && v >= 0) nums.push(v);
  }
  const trailingUsdRe = /([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*USD/gi;
  while ((m = trailingUsdRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[1]);
    if (Number.isFinite(v) && v >= 0) nums.push(v);
  }
  const pctRe = /([\d]+(?:[.,]\d+)?)\s*%/gi;
  while ((m = pctRe.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(",", "."));
    if (Number.isFinite(v)) nums.push(v);
  }
  const countRe =
    /(?:total de|encontr[eé].*?|hay)\s*\*?\*?(\d{1,6})\*?\*?\s*(?:resultados|clientes|productos)/gi;
  while ((m = countRe.exec(text)) !== null) {
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v)) nums.push(v);
  }
  const sorted = [...new Set(nums.map((n) => Math.round(n * 100) / 100))].sort(
    (a, b) => b - a,
  );
  const big = sorted.filter((n) => n >= 1000);
  return big.length ? big : sorted;
}

function numbersMatch(expected, found, tolerancePct) {
  if (expected == null || !Number.isFinite(expected)) return { ok: false, reason: "sin métrica" };
  if (!found.length) return { ok: false, reason: "IA sin cifras extraíbles" };
  for (const f of found) {
    const diff = Math.abs(f - expected) / Math.max(Math.abs(expected), 1);
    if (diff <= tolerancePct / 100) return { ok: true, matched: f, diffPct: diff * 100 };
  }
  const closest = found.reduce((b, f) => {
    const d = Math.abs(f - expected);
    return d < b.d ? { f, d } : b;
  }, { f: found[0], d: Infinity });
  return {
    ok: false,
    reason: `cercano ${closest.f} vs ref ${expected} (Δ ${((closest.d / Math.max(Math.abs(expected), 1)) * 100).toFixed(1)}%)`,
  };
}

async function login() {
  const user = process.env.AUTH_USER || "cora";
  const password = process.env.AUTH_PASSWORD || "CoraDemo2024!";
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie?.()?.join("; ") || res.headers.get("set-cookie");
  if (!cookie) throw new Error("Sin cookie sesión");
  return cookie;
}

async function askChat(question, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { error: `HTTP ${res.status}`, body: (await res.text()).slice(0, 300) };
    return { text: await res.text() };
  } catch (e) {
    return { error: e.name === "AbortError" ? `timeout ${CHAT_TIMEOUT_MS}ms` : String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

const MAX_RETRIES = parseInt(process.env.AUDIT_MAX_RETRIES || "2", 10);

async function runSql(pool, sqlText) {
  const r = await pool.request().query(sqlText);
  return { rows: r.recordset ?? [], rowCount: r.recordset?.length ?? 0 };
}

async function auditOne(item, ref, pool, cookie) {
  let dbResult = { rows: [], rowCount: 0 };
  let dbError = null;
  if (ref) {
    try {
      dbResult = await runSql(pool, ref.sql);
      if (ref.aggregateSql) {
        const agg = await runSql(pool, ref.aggregateSql);
        dbResult.aggregate = agg.rows[0];
      }
    } catch (e) {
      dbError = e.message;
    }
  }

  let lastChat = { text: "" };
  let status = "SKIP";
  let evalDetail = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const chat = await askChat(item.question, cookie);
    lastChat = chat;
    if (chat.error) {
      status = "FAIL";
      evalDetail = chat.error;
      continue;
    }
    if (!ref) {
      status = "NO_REF";
      evalDetail = "Sin referencia";
      break;
    }
    if (dbError) {
      status = "SQL_ERR";
      evalDetail = dbError;
      break;
    }
    const ev = evaluateRef(ref, dbResult, chat.text);
    if (ev.ok) {
      status = "PASS";
      evalDetail = ev.detail + (attempt ? ` (intento ${attempt + 1})` : "");
      break;
    }
    status = "FAIL";
    evalDetail = ev.detail + (attempt < MAX_RETRIES ? " — reintento…" : "");
  }

  return {
    id: item.id,
    question: item.question,
    status,
    evalDetail,
    referenceSql: ref?.sql ?? null,
    referenceLabel: ref?.label ?? null,
    dbRows: dbResult.rows.slice(0, 10),
    dbRowCount: dbResult.rowCount,
    dbAggregate: dbResult.aggregate ?? null,
    aiResponse: lastChat.text ?? lastChat.body ?? "",
    aiSnippet: (lastChat.text || lastChat.body || "").slice(0, 600),
  };
}

function evaluateRef(ref, dbResult, aiText) {
  const row0 = dbResult.rows[0] ?? {};
  if (ref.metric === "multi") {
    const vals = Object.values(row0).map(Number).filter(Number.isFinite);
    const nums = extractNumbers(aiText || "");
    const allOk = vals.every((v) => numbersMatch(v, nums, TOLERANCE_PCT).ok);
    return { ok: allOk, expected: row0, detail: allOk ? "multi OK" : `multi ${JSON.stringify(row0)}` };
  }
  if (dbResult.aggregate) {
    const aggKey = Object.keys(dbResult.aggregate)[0];
    const expectedAgg = Number(dbResult.aggregate[aggKey]);
    const nums = extractNumbers(aiText || "");
    const cmpAgg = numbersMatch(expectedAgg, nums, TOLERANCE_PCT);
    if (cmpAgg.ok) return { ok: true, expected: expectedAgg, detail: `≈ ${cmpAgg.matched} (total)` };
    for (const row of dbResult.rows) {
      const v = Number(row.venta_neta);
      if (numbersMatch(v, nums, TOLERANCE_PCT).ok) {
        return { ok: true, expected: v, detail: `canal ${row.CLAS_CLIENTE3} OK` };
      }
    }
  }
  const expected = Number(row0[ref.metric]);
  const nums =
    ref.metric === "porcentaje"
      ? (() => {
          const p = [];
          const pctRe = /([\d]+(?:[.,]\d+)?)\s*%/gi;
          let mm;
          while ((mm = pctRe.exec(aiText || "")) !== null) {
            const v = parseFloat(mm[1].replace(",", "."));
            if (Number.isFinite(v)) p.push(v);
          }
          return p;
        })()
      : extractNumbers(aiText || "");
  const cmp = numbersMatch(expected, nums, TOLERANCE_PCT);
  return { ok: cmp.ok, expected, detail: cmp.ok ? `≈ ${cmp.matched}` : cmp.reason };
}

async function main() {
  const { ids } = parseArgs();
  const areaA = flattenCatalog().filter((p) => p.id.startsWith("A"));
  const selected = ids ? areaA.filter((p) => ids.includes(p.id)) : areaA;

  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "bandavanoni_new_2018_resp",
    server: process.env.DB_SERVER || "localhost",
    port: parseInt(process.env.DB_PORT || "1433", 10),
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 120000,
  };

  const pool = await sql.connect(config);
  const ctxRow = await pool.request().query(`
    SELECT MAX(CAST(PERIODO AS VARCHAR(6))) AS max_p, MAX(ANIO) AS max_anio
    FROM dbo.meta_venta_neta WITH (NOLOCK)`);
  const maxPeriodo = String(ctxRow.recordset[0].max_p);
  const anioRef = Number(ctxRow.recordset[0].max_anio);
  const mm = maxPeriodo.slice(4, 6);
  const periodoPrevYear = `${anioRef - 1}${mm}`;
  const ctx = { maxPeriodo, anioRef, periodoPrevYear, anioComparacion: 2024 };
  const refs = buildAreaAReferences(ctx);

  const demoResults = [];
  for (const d of USER_DEMO_SQL) {
    try {
      const r = await runSql(pool, d.sql);
      demoResults.push({ ...d, ok: true, rowCount: r.rowCount, sample: r.rows.slice(0, 3) });
    } catch (e) {
      demoResults.push({ ...d, ok: false, error: e.message });
    }
  }

  let cookie;
  try {
    cookie = await login();
  } catch (e) {
    console.error("Login falló — ¿npm run dev?", e.message);
    process.exit(1);
  }

  const results = [];
  console.log(`\n=== Auditoría Área A (${selected.length} preguntas) ===`);
  console.log(`BD: ${config.database} | PERIODO_MAX: ${maxPeriodo} | ANIO_MAX: ${anioRef}\n`);

  for (const item of selected) {
    const ref = refs[item.id];
    const entry = await auditOne(item, ref, pool, cookie);
    results.push(entry);
    const icon = entry.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${item.id} [${entry.status}] ${entry.evalDetail}`);
  }

  await pool.close();

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    generatedAt: new Date().toISOString(),
    database: config.database,
    maxPeriodo,
    anioRef,
  };

  const outDir = path.join(__dirname, "..");
  const jsonPath = path.join(outDir, "audit-area-a-report.json");
  const mdPath = path.join(outDir, "audit-area-a-report.md");

  fs.writeFileSync(jsonPath, JSON.stringify({ summary, demoResults, results }, null, 2), "utf8");

  let md = `# Auditoría Área A — Clientes, ventas e ingresos\n\n`;
  md += `Generado: ${summary.generatedAt}\n\n`;
  md += `Base: **${config.database}** | PERIODO_MAX: **${maxPeriodo}** | ANIO_MAX: **${anioRef}**\n\n`;
  md += `## Resumen\n\n| Métrica | Valor |\n|---|---|\n`;
  md += `| Total | ${summary.total} |\n| PASS | ${summary.pass} |\n| FAIL | ${summary.fail} |\n\n`;

  md += `## SQL demostración (patrones usuario)\n\n`;
  for (const d of demoResults) {
    md += `### ${d.name}\n\`\`\`sql\n${d.sql}\n\`\`\`\n`;
    md += d.ok ? `Filas: ${d.rowCount} | Muestra: \`${JSON.stringify(d.sample)}\`\n\n` : `**Error:** ${d.error}\n\n`;
  }

  md += `## Preguntas A01–A10\n\n`;
  for (const r of results) {
    md += `### ${r.id} — ${r.question}\n\n`;
    md += `**Estado:** ${r.status} — ${r.evalDetail}\n\n`;
    md += `**SQL referencia:**\n\`\`\`sql\n${r.referenceSql || "—"}\n\`\`\`\n\n`;
    md += `**Resultado BD (hasta 10 filas):**\n\`\`\`json\n${JSON.stringify(r.dbRows, null, 2)}\n\`\`\`\n\n`;
    md += `**Respuesta IA:**\n\n${r.aiSnippet}\n\n---\n\n`;
  }

  fs.writeFileSync(mdPath, md, "utf8");

  console.log("\n=== Resumen ===", summary);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD:   ${mdPath}`);

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
