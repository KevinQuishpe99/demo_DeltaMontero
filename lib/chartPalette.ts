/** Paleta multicolor para gráficos CORA (barras, líneas, torta). */
export const CHART_PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#ca8a04",
  "#e11d48",
  "#9333ea",
  "#0284c7",
  "#16a34a",
] as const;

export function chartColorAt(index: number): string {
  return CHART_PALETTE[((index % CHART_PALETTE.length) + CHART_PALETTE.length) % CHART_PALETTE.length]!;
}

/** Texto para el system prompt del agente BI (solo gráficos). */
export const CHART_COLOR_PROMPT_RULES = `
**COLORES EN GRÁFICOS (obligatorio — solo aplica a bloques \`type":"chart"\`):**
- **Prohibido** gráficos monocromáticos (todo del mismo color).
- Cada objeto en \`series\` debe llevar \`color\` **distinto** tomado de esta paleta (en orden, sin repetir en la misma figura): ${CHART_PALETTE.join(", ")}.
- **Barras comparando años o categorías** (ej. 2024 vs 2025, Q1 vs Q2, canales): preferir **varias series** con un \`key\` por serie y \`color\` distinto, p. ej. \`series:[{"key":"v2024","name":"2024","color":"#2563eb"},{"key":"v2025","name":"2025","color":"#059669"}]\` y \`data\` con ambas columnas en cada fila. Alternativa válida: una serie y categorías en \`xKey\` (el UI colorea cada barra).
- **Líneas** con 2+ métricas o años: una serie por línea, cada una con \`color\` distinto.
- **Torta (pie):** no hace falta \`color\` por fila; el UI asigna color por segmento (sigue siendo multicolor).
- Si solo hay **un** dato numérico, **no** generes gráfico.
`.trim();
