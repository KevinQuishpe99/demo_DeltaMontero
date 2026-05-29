/** Lectura centralizada de flags de entorno del agente BI. */

function envTruthy(name: string, defaultWhenUnset = false): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultWhenUnset;
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return defaultWhenUnset;
}

/** Trazas `[BI agent]` en consola. Desactivar: `BI_DEBUG_LOGS=0`. */
export function isBiAgentDebugLogsEnabled(): boolean {
  return envTruthy("BI_DEBUG_LOGS", true);
}

/** SQL en consola del servidor (`[BI SQL]`). Desactivar: `BI_LOG_SQL_CONSOLE=0`. */
export function isBiSqlConsoleLogEnabled(): boolean {
  return envTruthy("BI_LOG_SQL_CONSOLE", true);
}

/**
 * Mostrar consultas SQL en el chat (stream de texto al usuario).
 * `BI_SHOW_SQL_IN_CHAT=true` → visible; `false` → oculto (default).
 */
export function isBiShowSqlInChatEnabled(): boolean {
  return envTruthy("BI_SHOW_SQL_IN_CHAT", false);
}
