/**
 * Auditoría Áreas B (B01–B08) y C (C01–C13).
 * npm run test:audit-area-bc
 */
import fs from "fs";
import path from "path";
import sql from "mssql";
import { fileURLToPath } from "url";
import { loadAppEnv } from "./load-env.mjs";
import { flattenCatalog } from "./preguntas-catalog.mjs";
import { buildAreaBCReferences } from "./area-bc-reference.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadAppEnv();

const BASE_URL = process.env.VALIDATE_BASE_URL || "http://localhost:3000";
const CHAT_TIMEOUT_MS = parseInt(process.env.VALIDATE_CHAT_TIMEOUT_MS || "240000", 10);
const TOLERANCE_PCT = parseFloat(process.env.VALIDATE_TOLERANCE_PCT || "3");
const MAX_RETRIES = parseInt(process.env.AUDIT_MAX_RETRIES || "2", 10);

function parseArgs() {
  const ids = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1]?.split(",").map((s) => s.trim());
  const area = process.argv.find((a) => a.startsWith("--area="))?.split("=")[1]?.toUpperCase();
  return { ids, area };
}

function parseMoneyToken(raw) {
  const s = String(raw).replace(/\$/g, "").trim();
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ""));
  return parseFloat(s.replace(/,/g, ""));
}

function extractNumbers(text, { allowNegative = false, includeSmall = false } = {}) {
  const nums = [];
  const moneyRe = /(?:\$\s*|USD\s*)(-?[\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = moneyRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[0]);
    if (Number.isFinite(v) && (allowNegative || v >= 0)) nums.push(v);
  }
  const trailingUsdRe = /(-?[\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)\s*USD/gi;
  while ((m = trailingUsdRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[1]);
    if (Number.isFinite(v) && (allowNegative || v >= 0)) nums.push(v);
  }
  const pctRe = /([\d]+(?:[.,]\d+)?)\s*%/gi;
  while ((m = pctRe.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(",", "."));
    if (Number.isFinite(v)) nums.push(v);
  }
  const countRe = /(?:total de|encontr[eé].*?|hay|identificamos|registramos)\s*\*?\*?(\d{1,3}(?:,\d{3})*|\d{1,6})\*?\*?\s*(?:resultados|clientes|productos|facturas|cierres|retenciones|alertas|c[oó]digos)/gi;
  while ((m = countRe.exec(text)) !== null) {
    const v = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(v)) nums.push(v);
  }
  const inactivosRe = /(\d{1,3}(?:,\d{3})*|\d{1,6})\s+clientes\s+inactivos/gi;
  while ((m = inactivosRe.exec(text)) !== null) {
    const v = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(v)) nums.push(v);
  }
  const leadingCountRe = /^\s*(?:hay\s+)?\*?\*?(\d{1,4})\*?\*?\s+productos/gim;
  while ((m = leadingCountRe.exec(text)) !== null) {
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v)) nums.push(v);
  }
  const sorted = [...new Set(nums.map((n) => Math.round(n * 100) / 100))].sort((a, b) => Math.abs(b) - Math.abs(a));
  if (includeSmall) return sorted;
  const big = sorted.filter((n) => Math.abs(n) >= (allowNegative ? 100 : 1000));
  return big.length ? big : sorted;
}

function numbersMatch(expected, found, tolerancePct) {
  if (expected == null || !Number.isFinite(expected)) return { ok: false, reason: "sin métrica" };
  if (!found.length) return { ok: false, reason: "IA sin cifras extraíbles" };
  const targets = [expected, Math.abs(expected)];
  for (const exp of targets) {
    for (const f of found) {
      const diff = Math.abs(f - exp) / Math.max(Math.abs(exp), 1);
      if (diff <= tolerancePct / 100) return { ok: true, matched: f, diffPct: diff * 100 };
    }
  }
  const closest = found.reduce((b, f) => {
    const d = Math.min(Math.abs(f - expected), Math.abs(f - Math.abs(expected)));
    return d < b.d ? { f, d } : b;
  }, { f: found[0], d: Infinity });
  return {
    ok: false,
    reason: `cercano ${closest.f} vs ref ${expected} (Δ ${((closest.d / Math.max(Math.abs(expected), 1)) * 100).toFixed(1)}%)`,
  };
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.AUTH_USER,
      password: process.env.AUTH_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Login HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie?.()?.join("; ") || res.headers.get("set-cookie");
  if (!cookie) throw new Error("Sin cookie");
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
    return { error: e.name === "AbortError" ? `timeout` : String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

async function runSql(pool, sqlText) {
  const r = await pool.request().query(sqlText);
  return { rows: r.recordset ?? [], rowCount: r.recordset?.length ?? 0 };
}

function evaluateRef(ref, dbResult, aiText) {
  if (ref.qualitative) {
    const ok = ref.passPattern.test(aiText || "");
    return { ok, detail: ok ? "límite declarado OK" : "no aclara límite de costos fijos" };
  }
  const row0 = dbResult.rows[0] ?? {};
  const allowNeg = ref.abs === true;
  if (ref.metric === "multi") {
    const vals = Object.values(row0).map(Number).filter(Number.isFinite);
    const nums = extractNumbers(aiText || "", { allowNegative: allowNeg });
    const allOk = vals.every((v) =>
      numbersMatch(ref.abs ? Math.abs(v) : v, nums, TOLERANCE_PCT).ok,
    );
    const anyOk = vals.some((v) =>
      numbersMatch(ref.abs ? Math.abs(v) : v, nums, TOLERANCE_PCT).ok,
    );
    const ok = ref.matchAny ? anyOk : allOk;
    return {
      ok,
      expected: row0,
      detail: ok ? (ref.matchAny ? "multi parcial OK" : "multi OK") : `multi ${JSON.stringify(row0)}`,
    };
  }
  let expected = Number(row0[ref.metric]);
  if (ref.abs) expected = Math.abs(expected);
  const isPct = ["margen", "concentracion", "pct_descuento"].includes(ref.metric);
  const countMetrics = new Set(["n", "alertas", "inactivos", "cierres"]);
  let nums = isPct
    ? (() => {
        const p = [];
        const pctRe = /([\d]+(?:[.,]\d+)?)\s*%/gi;
        let mm;
        while ((mm = pctRe.exec(aiText || "")) !== null) {
          const v = parseFloat(mm[1].replace(",", "."));
          if (Number.isFinite(v)) p.push(v);
        }
        if (ref.metric === "pct_descuento" && !p.length) {
          const decRe = /(?:promedio|descuento)[^\d]{0,40}([\d]+[.,]\d{2,4})/gi;
          while ((mm = decRe.exec(aiText || "")) !== null) {
            const v = parseFloat(mm[1].replace(",", "."));
            if (Number.isFinite(v) && v < 5) p.push(v);
          }
        }
        return p;
      })()
    : extractNumbers(aiText || "", {
        allowNegative: allowNeg,
        includeSmall: countMetrics.has(ref.metric),
      });
  if (ref.matchLargest && nums.length) {
    nums = [Math.max(...nums)];
  }
  const tol =
    isPct && expected < 5 ? 15 : ref.metric === "margen" ? 5 : TOLERANCE_PCT;
  const cmp = numbersMatch(expected, nums, tol);
  if (ref.metric === "pct_descuento" && cmp.ok && cmp.matched < expected * 0.25) {
    return { ok: false, expected, detail: `falso positivo ${cmp.matched} vs ref ${expected}` };
  }
  return { ok: cmp.ok, expected, detail: cmp.ok ? `≈ ${cmp.matched}` : cmp.reason };
}

async function auditOne(item, ref, pool, cookie) {
  let dbResult = { rows: [], rowCount: 0 };
  let dbError = null;
  if (ref?.sql) {
    try {
      dbResult = await runSql(pool, ref.sql);
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
      evalDetail = ev.detail + (attempt ? ` (r${attempt + 1})` : "");
      break;
    }
    status = "FAIL";
    evalDetail = ev.detail;
  }
  return {
    id: item.id,
    question: item.question,
    status,
    evalDetail,
    referenceSql: ref?.sql ?? null,
    referenceLabel: ref?.label ?? null,
    dbRows: dbResult.rows.slice(0, 10),
    aiSnippet: (lastChat.text || "").slice(0, 600),
  };
}

async function main() {
  const { ids, area } = parseArgs();
  let items = flattenCatalog().filter((p) => /^[BC]/.test(p.id));
  if (area === "B") items = items.filter((p) => p.id.startsWith("B"));
  if (area === "C") items = items.filter((p) => p.id.startsWith("C"));
  const selected = ids ? items.filter((p) => ids.includes(p.id)) : items;

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
  const ctx = { maxPeriodo, anioRef, anioComparacion: 2024, mesInactivoCutoff: "202506" };
  const refs = buildAreaBCReferences(ctx);

  const cookie = await login();
  const results = [];
  console.log(`\n=== Auditoría B+C (${selected.length} preguntas) ===`);
  console.log(`BD: ${config.database} | PERIODO_MAX: ${maxPeriodo}\n`);

  for (const item of selected) {
    const entry = await auditOne(item, refs[item.id], pool, cookie);
    results.push(entry);
    console.log(`${entry.status === "PASS" ? "✓" : "✗"} ${entry.id} [${entry.status}] ${entry.evalDetail}`);
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
  const jsonPath = path.join(outDir, "audit-area-bc-report.json");
  const mdPath = path.join(outDir, "audit-area-bc-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2), "utf8");

  let md = `# Auditoría Áreas B y C\n\nGenerado: ${summary.generatedAt}\n\n`;
  md += `| Total | PASS | FAIL |\n|---|---|---|\n| ${summary.total} | ${summary.pass} | ${summary.fail} |\n\n`;
  for (const r of results) {
    md += `### ${r.id} — ${r.question}\n\n**${r.status}** — ${r.evalDetail}\n\n`;
    md += `\`\`\`sql\n${r.referenceSql || "(qualitativa)"}\n\`\`\`\n\n`;
    md += `BD: \`${JSON.stringify(r.dbRows)}\`\n\n${r.aiSnippet}\n\n---\n\n`;
  }
  fs.writeFileSync(mdPath, md, "utf8");
  console.log("\n=== Resumen ===", summary);
  console.log(`JSON: ${jsonPath}\nMD: ${mdPath}`);
  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
