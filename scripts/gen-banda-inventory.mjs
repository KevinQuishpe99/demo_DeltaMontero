/**
 * Lee docs/banda_tablas_export_raw.tsv (columnas: banda, dbo, NombreTabla, fecha…)
 * y genera docs/banda_tablas_inventario.txt (un nombre por línea + cabecera).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rawPath = path.join(root, "docs", "banda_tablas_export_raw.tsv");
const outPath = path.join(root, "docs", "banda_tablas_inventario.txt");

if (!fs.existsSync(rawPath)) {
  console.error("Falta docs/banda_tablas_export_raw.tsv (export del listado banda/dbo/tabla).");
  process.exit(1);
}

const raw = fs.readFileSync(rawPath, "utf8");
const names = [];
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const p = t.split(/\t/).map((s) => s.trim());
  if (p.length >= 3 && p[0].toLowerCase() === "banda" && p[1].toLowerCase() === "dbo" && p[2]) {
    names.push(p[2]);
  }
}
if (names.length === 0) {
  console.warn(
    "No se encontraron filas banda\\tdbo\\tTabla. Pega el volcado en docs/banda_tablas_export_raw.tsv (sin líneas #)."
  );
}

const header = [
  "# banda.dbo — inventario de nombres de tabla (referencia)",
  `# Total: ${names.length} (no implica que el agente pueda consultarlas todas; ver lib/sqlGuard.ts)`,
  "",
].join("\n");

fs.writeFileSync(outPath, header + names.join("\n") + "\n");
console.log("Escrito", outPath, "con", names.length, "tablas.");
