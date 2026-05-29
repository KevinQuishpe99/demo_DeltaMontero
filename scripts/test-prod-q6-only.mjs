import { loadAppEnv } from "./load-env.mjs";
loadAppEnv();
const BASE = "https://demo-delta-montero.vercel.app";
const q =
  "¿Qué productos crecieron más en ventas de 2024 a 2025 y cuáles decrecieron? Dame los 10 de cada métrica con cuánto subieron o decrecieron en monto y porcentaje, y un gráfico para entenderlo visualmente.";
const lr = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: process.env.AUTH_USER,
    password: process.env.AUTH_PASSWORD,
  }),
});
const ck = (lr.headers.get("set-cookie") || "").split(";")[0];
const t0 = Date.now();
const res = await fetch(`${BASE}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: ck },
  body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
});
const txt = await res.text();
console.log("status", res.status, "ms", Date.now() - t0, "len", txt.length);
console.log(/error al intentar|problema de conexion/i.test(txt) ? "BAD" : "ok phrases");
console.log(/"type"\s*:\s*"chart"/i.test(txt) ? "chart yes" : "chart no");
console.log(txt.slice(0, 600));
