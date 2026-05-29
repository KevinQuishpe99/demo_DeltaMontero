/**
 * Regenera preguntas.md desde scripts/preguntas-catalog.mjs (tablas + columna Prueba).
 * Uso: node scripts/gen-preguntas-md.mjs
 *
 * La columna Prueba queda vacía (rellenar a mano o vía test con --update-md).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PREGUNTAS_CATALOG } from "./preguntas-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function escCell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

let md = `# DELTAMONTERO PROYECTO IA — Catálogo de preguntas

Columna **Prueba**: \`1\` = pasó heurística automática, \`0\` = falló. Columna **Detalle**: en fallos, motivo y extracto de lo que respondió la API.  
Actualizar con: \`npm run test:preguntas-todas -- --update-md\` (con \`npm run dev\` y API accesible).

---

`;

for (const [letter, title, qs] of PREGUNTAS_CATALOG) {
  md += `## ${title}\n\n`;
  md += `| ID | Pregunta | Prueba | Detalle |\n`;
  md += `|----|----------|--------|---------|\n`;
  qs.forEach((q, i) => {
    const id = `${letter}${String(i + 1).padStart(2, "0")}`;
    md += `| ${id} | ${escCell(q)} |  |  |\n`;
  });
  md += `\n`;
}

md += `---

## Cobertura IA (resumen)

- Tabla detallada vista/fuente: **preguntas_cobertura_IA.md**
- Script de vistas: **domentacion/bbdd/GestionBI_IA_capa_completa.sql**
- Tests contra /api/chat: **npm run test:preguntas-todas**
`;

const outPath = path.join(root, "preguntas.md");
fs.writeFileSync(outPath, md, "utf-8");
console.log("Escrito:", outPath);
