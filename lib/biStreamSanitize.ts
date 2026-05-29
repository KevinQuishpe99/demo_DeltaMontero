/**
 * Elimina del stream del asistente (y del texto del usuario en el historial) restos de
 * frases que el modelo repite o que el usuario copia por error.
 * Usa retención final (tail) para no cortar un patrón entre chunks.
 */
const TAIL_CHARS = 96;

/** Patrones aplicados al asistente y al contenido de mensajes user/assistant en el historial. */
const ARTIFACT_PATTERNS: RegExp[] = [
  /Indica\s+solo\s+una\s+pregunta\s+prioritaria(?:\s+para\s+poder\s+responderte)?[\s.]*/gi,
  /Indica\s+una\s+pregunta\s+prioritaria[^\n]*/gi,
  /(?:^|[\s\n])Indica[^\n]{0,120}prioritaria[^\n]*/gi,
  /\bSolo\s+indica\s+una\s+pregunta[^\n]*/gi,
  /Parece que hubo un error al intentar[^\n]*/gi,
  /hubo un error al intentar[^\n]*/gi,
  /error al intentar consultar[^\n]*/gi,
  /Parece que hubo un problema de conexión[^\n]*/gi,
  /hubo un problema de conexión[^\n]*/gi,
  /problema de conexión al intentar acceder[^\n]*/gi,
  /problema de conexi[oó]n interno[^\n]*/gi,
  /Intentar[eé]\s+ejecutar la consulta[^\n]*/gi,
  /Un momento,?\s*por favor[^\n.]*/gi,
  /tuve\s+problemas[^\n]*/gi,
  /No encontr[eé]\s+datos[^\n]*/gi,
  /Esto puede deberse a que no hay registros[^\n]*/gi,
  /Si deseas,?\s+puedo buscar[^\n]*/gi,
  /Solo h[aá]zm[eé]lo saber[^\n.]*/gi,
];

/** Limpia texto antes de guardarlo en historial o mostrarlo. */
export function stripArtifactPhrases(s: string): string {
  let out = s;
  for (const re of ARTIFACT_PATTERNS) {
    out = out.replace(re, " ");
  }
  out = out.replace(/```\s*sql\s*[\s\S]*?```/gi, "");
  out = out.replace(
    /#{1,6}\s*Detalle técnico[\s\S]*?(?=\n#{1,6}\s|\n---\n|$)/gi,
    ""
  );
  out = out.replace(/#{1,6}\s*Consulta[\s\S]*?```[\s\S]*?```/gi, "");
  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/** Alias legado para mensajes del asistente. */
export function stripAssistantForbiddenPhrases(s: string): string {
  return stripArtifactPhrases(s);
}

export class AssistantOutputSanitizer {
  private buf = "";

  feed(chunk: string, push: (s: string) => void): void {
    this.buf += chunk;
    for (;;) {
      let earliest: { start: number; end: number } | null = null;
      for (const re of ARTIFACT_PATTERNS) {
        re.lastIndex = 0;
        const m = re.exec(this.buf);
        if (m && m.index !== undefined) {
          const end = m.index + m[0].length;
          if (!earliest || m.index < earliest.start) {
            earliest = { start: m.index, end };
          }
        }
      }
      if (!earliest) break;
      if (earliest.end > this.buf.length - TAIL_CHARS) break;
      this.buf =
        this.buf.slice(0, earliest.start) + this.buf.slice(earliest.end);
    }

    if (this.buf.length > TAIL_CHARS) {
      const keep = this.buf.length - TAIL_CHARS;
      push(this.buf.slice(0, keep));
      this.buf = this.buf.slice(keep);
    }
  }

  flush(push: (s: string) => void): void {
    let cleaned = stripArtifactPhrases(this.buf);
    this.buf = "";
    cleaned = cleaned.replace(/^\s*\n+/, "");
    if (cleaned.length) push(cleaned);
  }
}
