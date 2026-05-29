export {
  BI_AGENT_SYSTEM_PROMPT,
  IA_VENTAS_SYSTEM_PROMPT,
} from "@/lib/biMasterPrompt";

export const SYNC_WARNING_APPENDIX = `

[AVISO SISTEMA] La sincronización USP_COM_VENTAS_NETA_DETALLE no se ejecutó en este turno (error o timeout). Los datos LIVE de hoy en ventas podrían no estar actualizados; el histórico en vistas maestras sigue siendo válido. Indica este matiz si la pregunta depende del día actual o de ORIGEN='LIVE' en ventas.`;
