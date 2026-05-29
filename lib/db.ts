import sql from "mssql";

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER || "localhost",
  port: parseInt(process.env.DB_PORT || "1433", 10),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "30000", 10),
  requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT_MS || "120000", 10),
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getDB(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export type EtlResult = { periodo: string; idEmpresas: number };

/**
 * Ejecuta el ETL de ventas netas (SP). Usado por el chat y por /api/etl (cron).
 * @param periodoOverride YYYYMM; si se omite, usa SYNC_PERIODOS o mes calendario actual.
 */
export async function runEtlVentasNetaDetalle(
  periodoOverride?: string | null
): Promise<EtlResult> {
  const pool = await getDB();
  const idEmpresas = parseInt(process.env.SYNC_ID_EMPRESAS || "1", 10);
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const periodos =
    (periodoOverride && periodoOverride.trim()) ||
    process.env.SYNC_PERIODOS ||
    `${y}${m}`;

  await pool
    .request()
    .input("IDEMPRESAS", sql.Int, idEmpresas)
    .input("PERIODOS", sql.VarChar(32), periodos)
    .input("procesar", sql.Char(1), "S")
    .execute("USP_COM_VENTAS_NETA_DETALLE");

  return { periodo: periodos, idEmpresas };
}

/** Refresca datos vía SP antes de consultas IA (regla de negocio). */
export async function syncVentasNetaDetalle(): Promise<void> {
  await runEtlVentasNetaDetalle();
}
