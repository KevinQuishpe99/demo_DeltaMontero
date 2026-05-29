/**
 * Prueba login + /api/chat en producción (preguntas Kevin).
 * Uso: node scripts/test-prod-kevin-preguntas.mjs
 */
import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

const BASE =
  process.env.VALIDATE_BASE_URL || "https://demo-delta-montero.vercel.app";
const USER = process.env.AUTH_USER?.trim() || "";
const PASS = process.env.AUTH_PASSWORD ?? "";
const TIMEOUT_MS = parseInt(process.env.VALIDATE_CHAT_TIMEOUT_MS || "90000", 10);

const PREGUNTAS = [
  "Compara las ventas netas del primer trimestre de 2024 y del primer trimestre de 2025 y muéstrame un gráfico claro que me deje ver las diferencias, requiero los totales y la diferencia en porcentaje de variación.",
  "¿Total de ventas en el año 2024 frente al 2025? Haz una comparación directa entre los dos años y dame la variación en monto y en porcentaje.",
  "¿Cuáles fueron los 10 productos más vendidos en el 2025? Haz una tabla con nombre de producto, ventas totales y el porcentaje de participación en relación al total del año.",
  "En el año 2024, ¿qué clientes generaron más ingresos totales y mayor margen de rentabilidad? Explícalo con números y un gráfico fácil de entender para una reunión de directorio.",
  "¿Cómo se repartieron las ventas por trimestre en 2024 y en 2025? Compara T1, T2, T3 y T4 de cada año, dime cuál fue el mejor trimestre y cuál el más bajo, y muéstrame un gráfico para ver la diferencia entre los dos años.",
  "¿Qué productos crecieron más en ventas de 2024 a 2025 y cuáles decrecieron? Dame los 10 de cada métrica con cuánto subieron o decrecieron en monto y porcentaje, y un gráfico para entenderlo visualmente.",
];

const FORBIDDEN = [
  /problema de conexi[oó]n/i,
  /error al intentar/i,
  /hubo un error/i,
  /An error occurred while processing your request/i,
  /help\.openai\.com/i,
  /no pude acceder/i,
  /intentar[eé].*nuevamente/i,
  /contacte.*soporte/i,
  /si deseas.*puedo buscar/i,
];

function hasNumbers(text) {
  return /\$[\d,]+|\d{1,3}(?:,\d{3})+|\d+\s*%/.test(text);
}

function hasChart(text) {
  return /"type"\s*:\s*"chart"/i.test(text) || /```chart/i.test(text);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = res.headers.get("set-cookie") || "";
  const cookies = setCookie.length ? setCookie : raw ? [raw] : [];
  const cookieHeader = cookies
    .map((c) => String(c).split(";")[0])
    .filter(Boolean)
    .join("; ");
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Login ${res.status}: ${j.error || res.statusText}`);
  }
  if (!cookieHeader.includes("cora_auth")) {
    throw new Error("Login OK pero sin cookie cora_auth");
  }
  return cookieHeader;
}

async function chat(cookie, question) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
    }),
    signal: ac.signal,
  });
  clearTimeout(t);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Chat ${res.status}: ${txt.slice(0, 200)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Sin body stream");
  const dec = new TextDecoder();
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
  }
  return acc;
}

async function main() {
  if (!USER || !PASS) {
    console.error("Faltan AUTH_USER / AUTH_PASSWORD en .env");
    process.exit(1);
  }
  console.log(`Base: ${BASE}`);
  const cookie = await login();
  console.log("Login OK\n");

  const results = [];
  for (let i = 0; i < PREGUNTAS.length; i++) {
    const q = PREGUNTAS[i];
    const id = `Q${i + 1}`;
    process.stdout.write(`${id}... `);
    const t0 = Date.now();
    try {
      const text = await chat(cookie, q);
      const ms = Date.now() - t0;
      const badPhrase = FORBIDDEN.find((re) => re.test(text));
      const ok =
        !badPhrase &&
        hasNumbers(text) &&
        text.trim().length > 80 &&
        !/^Error:/m.test(text);
      const chart = hasChart(text);
      results.push({
        id,
        ok,
        ms,
        chart,
        len: text.length,
        bad: badPhrase?.source,
        preview: text.slice(0, 280).replace(/\s+/g, " "),
      });
      console.log(ok ? `OK (${ms}ms, chart=${chart})` : `FAIL (${ms}ms)`);
      if (!ok) console.log("  ", text.slice(0, 400));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id, ok: false, error: msg });
      console.log(`ERROR: ${msg}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${PREGUNTAS.length} OK ===`);
  const outPath = "validate-prod-kevin-report.json";
  const fs = await import("fs");
  fs.writeFileSync(outPath, JSON.stringify({ base: BASE, results }, null, 2));
  console.log(`Reporte: ${outPath}`);
  process.exit(passed === PREGUNTAS.length ? 0 : 1);
}

main();
