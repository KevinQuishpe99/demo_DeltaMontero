/**
 * Valida ~20 preguntas al azar: ground truth SQL vs respuesta /api/chat.
 *
 * Uso:
 *   npm run test:validate-ia
 *   npm run test:validate-ia -- --count=20 --seed=42
 *   npm run test:validate-ia -- --ids=A01,A05,D01,F03
 *
 * Requiere: npm run dev, .env con DB_* y OPENAI_API_KEY, AUTH_*.
 */
import fs from "fs";
import path from "path";
import sql from "mssql";
import { fileURLToPath } from "url";
import { loadAppEnv } from "./load-env.mjs";
import { flattenCatalog } from "./preguntas-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadAppEnv();

const BASE_URL = process.env.VALIDATE_BASE_URL || "http://localhost:3000";
const CHAT_TIMEOUT_MS = parseInt(process.env.VALIDATE_CHAT_TIMEOUT_MS || "180000", 10);
const TOLERANCE_PCT = parseFloat(process.env.VALIDATE_TOLERANCE_PCT || "3");

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 20;
  let seed = Date.now();
  let ids = null;
  for (const a of args) {
    if (a.startsWith("--count=")) count = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--seed=")) seed = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--ids=")) ids = a.split("=")[1].split(",").map((s) => s.trim());
  }
  return { count, seed, ids };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom(items, n, seed) {
  const rng = mulberry32(seed);
  const copy = [...items];
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(rng() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function parseMoneyToken(raw) {
  const s = raw.replace(/\$/g, "").trim();
  if (!s) return NaN;
  // US: 1,234,567.89
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return parseFloat(s.replace(/,/g, ""));
  }
  // EU: 1.234.567,89
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(s.replace(/,/g, ""));
}

function extractNumbers(text) {
  const nums = [];
  const moneyRe = /\$\s*([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;
  let m;
  while ((m = moneyRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[0]);
    if (Number.isFinite(v) && v >= 0) nums.push(v);
  }
  const pctRe = /([\d]+(?:[.,]\d+)?)\s*%/gi;
  while ((m = pctRe.exec(text)) !== null) {
    const v = parseFloat(m[1].replace(",", "."));
    if (Number.isFinite(v)) nums.push(v);
  }
  const plainRe = /(?<!\d)([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)(?!\d)/g;
  while ((m = plainRe.exec(text)) !== null) {
    const v = parseMoneyToken(m[1]);
    if (Number.isFinite(v) && v >= 0) nums.push(v);
  }
  return [...new Set(nums.map((n) => Math.round(n * 100) / 100))].sort((a, b) => b - a);
}

function numbersMatch(expected, found, tolerancePct) {
  if (expected == null || !Number.isFinite(expected)) return { ok: false, reason: "sin referencia numérica" };
  if (!found.length) return { ok: false, reason: "IA no devolvió cifras" };
  for (const f of found) {
    const diff = Math.abs(f - expected) / Math.max(Math.abs(expected), 1);
    if (diff <= tolerancePct / 100) return { ok: true, matched: f, diffPct: diff * 100 };
  }
  const closest = found.reduce((best, f) => {
    const d = Math.abs(f - expected);
    return d < best.d ? { f, d } : best;
  }, { f: found[0], d: Infinity });
  return {
    ok: false,
    reason: `más cercano ${closest.f} vs esperado ${expected} (Δ ${((closest.d / Math.max(Math.abs(expected), 1)) * 100).toFixed(1)}%)`,
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
  if (!res.ok) throw new Error(`Login falló HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie?.()?.join("; ") ||
    res.headers.get("set-cookie");
  if (!cookie) throw new Error("Sin cookie de sesión tras login");
  return cookie;
}

async function askChat(question, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      return { error: `HTTP ${res.status}`, body: t.slice(0, 500) };
    }
    const text = await res.text();
    return { text };
  } catch (e) {
    return { error: e.name === "AbortError" ? `timeout ${CHAT_TIMEOUT_MS}ms` : String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** Referencias SQL verificadas en bandavanoni_new_2018_resp */
function buildReferenceQueries(ctx) {
  const { maxPeriodo, anioRef, periodoPrevYear } = ctx;
  return {
    A01: `SELECT SUM(VENTA_NETA) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}'`,
    A02: `SELECT SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}' THEN VENTA_NETA ELSE 0 END) AS mes_actual,
      SUM(CASE WHEN CAST(PERIODO AS VARCHAR(6))='${periodoPrevYear}' THEN VENTA_NETA ELSE 0 END) AS mismo_mes_anio_ant
      FROM dbo.meta_venta_neta WITH (NOLOCK)`,
    A03: `SELECT SUM(CASE WHEN ANIO=${anioRef} THEN VENTA_NETA ELSE 0 END) AS ytd,
      SUM(CASE WHEN ANIO=${anioRef - 1} THEN VENTA_NETA ELSE 0 END) AS ytd_ant
      FROM dbo.meta_venta_neta WITH (NOLOCK)`,
    A04: `SELECT TOP 1 CLASIFICACION1, SUM(VENTA_NETA) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef} GROUP BY CLASIFICACION1 ORDER BY v DESC`,
    A05: `SELECT SUM(VENTA_NETA) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef}`,
    A06: `SELECT TOP 1 VENDEDOR, SUM(VENTA_NETA) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef} GROUP BY VENDEDOR ORDER BY v DESC`,
    A07: `SELECT TOP 1 NOMBRE_COMPLETO, SUM(VENTA_NETA) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}' GROUP BY NOMBRE_COMPLETO ORDER BY v DESC`,
    A08: `SELECT COUNT(*) AS v FROM (
      SELECT NOMBRE_COMPLETO FROM dbo.meta_venta_neta WITH (NOLOCK)
      GROUP BY NOMBRE_COMPLETO
      HAVING SUM(CASE WHEN ANIO=${anioRef - 1} THEN VENTA_NETA ELSE 0 END) > 0
        AND SUM(CASE WHEN ANIO=${anioRef} THEN VENTA_NETA ELSE 0 END)
          < SUM(CASE WHEN ANIO=${anioRef - 1} THEN VENTA_NETA ELSE 0 END)
    ) x`,
    A09: `SELECT COUNT(DISTINCT RUC) AS v FROM dbo.meta_venta_neta WITH (NOLOCK)
      WHERE CAST(PERIODO AS VARCHAR(6))='${maxPeriodo}' AND RUC IS NOT NULL
      AND RUC NOT IN (SELECT DISTINCT RUC FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE RUC IS NOT NULL AND CAST(PERIODO AS VARCHAR(6)) < '${maxPeriodo}')`,
    A10: `SELECT TOP 1 100.0*SUM(VENTA_NETA)/NULLIF((SELECT SUM(VENTA_NETA) FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202401'),0) AS v
      FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202401' GROUP BY NOMBRE_COMPLETO ORDER BY v DESC`,
    B01: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202501' GROUP BY CLASIFICACION1 ORDER BY SUM(VENTA_NETA) DESC`,
    B02: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(6))='202401' GROUP BY NOMBRE_COMPLETO ORDER BY SUM(VENTA_NETA) DESC`,
    B03: `SELECT COUNT(*) AS v FROM (SELECT CODIGO FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef} GROUP BY CODIGO HAVING SUM(UTILIDAD)<0) x`,
    B04: `SELECT TOP 1 100.0*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0) AS v FROM dbo.meta_venta_neta WITH (NOLOCK) WHERE ANIO=${anioRef - 1} GROUP BY CLAS_CLIENTE3 ORDER BY SUM(VENTA_NETA) DESC`,
    D01: `SELECT SUM(FCC_VALOR - FCC_PAGADO) AS v FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE (FCC_VALOR - FCC_PAGADO) > 0`,
    D02: `SELECT SUM(FCC_VALOR - FCC_PAGADO) AS v FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE (FCC_VALOR - FCC_PAGADO) > 0 AND DATEDIFF(day, FCC_VEND, GETDATE()) BETWEEN 0 AND 30`,
    D07: `SELECT COUNT(*) AS v FROM dbo.FAC_CARTERA WITH (NOLOCK) WHERE (FCC_VALOR - FCC_PAGADO) > 0 AND FCC_VEND BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(day,30,CAST(GETDATE() AS DATE))`,
    F02: `SELECT COUNT(DISTINCT STK_BODEGA) AS v FROM dbo.FAC_STOCK WITH (NOLOCK) WHERE STK_ACTUAL > 0`,
    F03: `SELECT SUM(ISNULL(STK_ACTUAL,0)*ISNULL(STK_COSTO_ACTUAL,0)) AS v FROM dbo.FAC_STOCK WITH (NOLOCK) WHERE STK_ACTUAL > 0`,
    F05: `SELECT COUNT(*) AS v FROM dbo.FAC_STOCK WITH (NOLOCK) WHERE STK_MINIMO > 0 AND STK_ACTUAL < STK_MINIMO`,
    H03: `SELECT COUNT(*) AS v FROM (
      SELECT s.TBS_CODIGO FROM dbo.FAC_STOCK s WITH (NOLOCK)
      INNER JOIN dbo.meta_venta_neta m WITH (NOLOCK) ON m.CODIGO = s.TBS_CODIGO AND m.ANIO=${anioRef}
      WHERE s.STK_ACTUAL > 0 GROUP BY s.TBS_CODIGO HAVING SUM(m.CANTIDAD) > 100
    ) x`,
    I01: `SELECT SUM(ISNULL(BCO_SALDO,0)) AS v FROM dbo.BCO WITH (NOLOCK)`,
    C13: `SELECT COUNT(*) AS v FROM dbo.FAC_CIERRE_CAJA WITH (NOLOCK) WHERE CICA_FECHA >= DATEADD(month,-1,GETDATE())`,
  };
}

async function runReference(pool, sqlText) {
  const r = await pool.request().query(sqlText);
  const row = r.recordset?.[0] ?? {};
  const keys = Object.keys(row);
  if (keys.length === 1) return { value: Number(row[keys[0]]), row, sql: sqlText };
  if ("v" in row) return { value: Number(row.v), row, sql: sqlText };
  return { value: null, row, sql: sqlText, multi: true };
}

async function main() {
  const { count, seed, ids } = parseArgs();
  const all = flattenCatalog();

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
  const metaCtx = await pool.request().query(`
    SELECT MAX(CAST(PERIODO AS VARCHAR(6))) AS max_p, MAX(ANIO) AS max_anio
    FROM dbo.meta_venta_neta WITH (NOLOCK)
  `);
  const maxPeriodo = String(metaCtx.recordset[0].max_p);
  const anioRef = Number(metaCtx.recordset[0].max_anio);
  const mm = maxPeriodo.slice(4, 6);
  const periodoPrevYear = `${anioRef - 1}${mm}`;

  const refs = buildReferenceQueries({ maxPeriodo, anioRef, periodoPrevYear });
  const withRef = all.filter((p) => refs[p.id]);
  const selected = ids
    ? all.filter((p) => ids.includes(p.id))
    : pickRandom(withRef.length >= count ? withRef : all, count, seed);

  let cookie;
  try {
    cookie = await login();
  } catch (e) {
    console.error("No se pudo autenticar. ¿npm run dev activo?", e.message);
    process.exit(1);
  }

  const results = [];
  console.log(
    `\n=== Validación IA vs BD (${selected.length} preguntas, seed=${seed}, conRef=${withRef.length}) ===`,
  );
  console.log(`Base: ${config.database} | Período ref: ${maxPeriodo} | URL: ${BASE_URL}\n`);

  for (const item of selected) {
    const refSql = refs[item.id];
    let ground = null;
    if (refSql) {
      try {
        ground = await runReference(pool, refSql);
      } catch (e) {
        ground = { error: e.message, sql: refSql };
      }
    }

    const chat = await askChat(item.question, cookie);
    let status = "SKIP";
    let detail = "";

    if (chat.error) {
      status = "FAIL";
      detail = chat.error;
    } else if (!refSql) {
      status = "NO_REF";
      detail = "Sin SQL de referencia; revisar manualmente";
    } else if (ground?.error) {
      status = "SQL_ERR";
      detail = ground.error;
    } else if (ground?.multi) {
      const nums = extractNumbers(chat.text || "");
      const vals = Object.values(ground.row).map((x) => Number(x)).filter(Number.isFinite);
      const allMatch = vals.every((v) => numbersMatch(v, nums, TOLERANCE_PCT).ok);
      status = allMatch ? "PASS" : "PARTIAL";
      detail = allMatch
        ? `Multi-columna OK: ${JSON.stringify(ground.row)}`
        : `Multi-columna: ${JSON.stringify(ground.row)} vs IA nums ${nums.slice(0, 5).join(", ")}`;
    } else {
      const nums = extractNumbers(chat.text || "");
      const cmp = numbersMatch(ground.value, nums, TOLERANCE_PCT);
      status = cmp.ok ? "PASS" : "FAIL";
      detail = cmp.ok ? `≈ ${cmp.matched} (ref ${ground.value})` : cmp.reason;
    }

    results.push({
      id: item.id,
      question: item.question,
      status,
      detail,
      expected: ground?.value ?? null,
      refSql: refSql ?? null,
      aiSnippet: (chat.text || chat.body || "").slice(0, 400),
    });

    const icon = status === "PASS" ? "✓" : status === "NO_REF" ? "?" : "✗";
    console.log(`${icon} ${item.id} [${status}] ${item.question.slice(0, 60)}…`);
    console.log(`   ${detail}\n`);
  }

  await pool.close();

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    noRef: results.filter((r) => r.status === "NO_REF").length,
    other: results.filter((r) => !["PASS", "FAIL", "NO_REF"].includes(r.status)).length,
  };

  const outPath = path.join(__dirname, "..", "validate-ia-report.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, seed, results }, null, 2), "utf8");

  console.log("=== Resumen ===");
  console.log(summary);
  console.log(`Reporte: ${outPath}`);

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
