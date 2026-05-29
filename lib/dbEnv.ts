/** Lectura de variables de entorno para DB (runtime en Edge/API). */
export function readDbEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

/** Postgres Azure / Montero_db cuando hay DB_HOST o PG_DATABASE_URL. */
export function isPostgresDb(): boolean {
  return Boolean(readDbEnv("PG_DATABASE_URL") || readDbEnv("DB_HOST"));
}
