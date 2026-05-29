/**
 * Arranca Next en todas las interfaces y muestra Local + IP de red real (Windows suele imprimir 0.0.0.0).
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const port = process.env.PORT?.trim() || "3000";

/** IPv4 preferida para compartir en LAN (evita Hyper-V, APIPA, etc.). */
function getLanIPv4() {
  /** @type {{ address: string; score: number }[]} */
  const candidates = [];

  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue;
    for (const net of ifaces) {
      const family = net.family;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || net.internal) continue;

      const addr = net.address;
      let score = 0;
      if (addr.startsWith("10.")) score = 100;
      else if (addr.startsWith("192.168.") && !addr.startsWith("192.168.224.")) score = 80;
      else if (addr.startsWith("172.")) {
        const second = Number(addr.split(".")[1]);
        if (second >= 16 && second <= 31) score = 70;
      } else if (addr.startsWith("192.168.")) score = 40;
      else score = 10;

      candidates.push({ address: addr, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

const lanIp = getLanIPv4();
const networkUrl = lanIp ? `http://${lanIp}:${port}` : `(no se detectó IPv4 LAN — usa ipconfig)`;

console.log("");
console.log("  ▲ Next.js (DeltaMontero / Cora)");
console.log(`  - Local:    http://localhost:${port}`);
console.log(`  - Network:  ${networkUrl}`);
console.log("");

const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev", "-H", "0.0.0.0", "-p", port], {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
