/**
 * Carga app/.env y app/.env.local (sin dependencia dotenv).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (let line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    const quoted =
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"));
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      const cut = val.search(/\s+#/);
      if (cut !== -1) val = val.slice(0, cut).trim();
    }
    if (process.env[key] === undefined || filePath.endsWith(".env.local")) {
      process.env[key] = val;
    }
  }
}

export function loadAppEnv() {
  parseEnvFile(path.join(root, ".env"));
  parseEnvFile(path.join(root, ".env.local"));
}
