import sql from "mssql";
import pg from "pg";
import { isPostgresDb, readDbEnv } from "@/lib/dbEnv";
import { translateMssqlToPostgres } from "@/lib/pgSqlTranslate";

let mssqlPool: sql.ConnectionPool | null = null;
let pgPool: pg.Pool | null = null;

function mssqlConfig(): sql.config {
  return {
    user: readDbEnv("DB_USER"),
    password: readDbEnv("DB_PASSWORD"),
    database: readDbEnv("DB_NAME"),
    server: readDbEnv("DB_SERVER") || "localhost",
    port: parseInt(readDbEnv("DB_PORT") || "1433", 10),
    connectionTimeout: parseInt(
      readDbEnv("DB_CONNECTION_TIMEOUT_MS") || "30000",
      10
    ),
    requestTimeout: parseInt(
      readDbEnv("DB_REQUEST_TIMEOUT_MS") || "120000",
      10
    ),
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };
}

function pgPoolConfig(): pg.PoolConfig {
  const url = readDbEnv("PG_DATABASE_URL");
  const sslEnabled = readDbEnv("DB_SSL") === "true";
  const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;
  const max = parseInt(readDbEnv("DB_POOL_MAX") || "2", 10);
  const connectionTimeoutMillis = parseInt(
    readDbEnv("DB_CONNECTION_TIMEOUT_MS") || "30000",
    10
  );

  if (url) {
    return { connectionString: url, ssl, max, connectionTimeoutMillis };
  }

  const host = readDbEnv("DB_HOST");
  const user = readDbEnv("DB_USER");
  const password = readDbEnv("DB_PASSWORD");
  const database = readDbEnv("DB_NAME");

  if (!host || !user || !password || !database) {
    throw new Error(
      "Faltan DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o PG_DATABASE_URL) para PostgreSQL."
    );
  }

  return {
    host,
    port: parseInt(readDbEnv("DB_PORT") || "5432", 10),
    user,
    password,
    database,
    ssl,
    max,
    connectionTimeoutMillis,
  };
}

async function getPgPool(): Promise<pg.Pool> {
  if (!pgPool) {
    pgPool = new pg.Pool(pgPoolConfig());
  }
  return pgPool;
}

async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (mssqlPool?.connected) return mssqlPool;
  mssqlPool = await new sql.ConnectionPool(mssqlConfig()).connect();
  return mssqlPool;
}

/** Compatibilidad: calienta conexión (Postgres o SQL Server). */
export async function getDB(): Promise<sql.ConnectionPool | pg.Pool> {
  if (isPostgresDb()) return getPgPool();
  return getMssqlPool();
}

/** Postgres devuelve alias en minúsculas; la app espera MAYÚSCULAS (META, export). */
function normalizeRowKeys(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k.toUpperCase()] = v;
    }
    return out;
  });
}

/** Ejecuta SELECT y devuelve filas (traduce T-SQL → Postgres si aplica). */
export async function queryRows(
  sqlText: string
): Promise<Record<string, unknown>[]> {
  if (isPostgresDb()) {
    const pool = await getPgPool();
    const pgSql = translateMssqlToPostgres(sqlText);
    const result = await pool.query(pgSql);
    return normalizeRowKeys(result.rows as Record<string, unknown>[]);
  }

  const pool = await getMssqlPool();
  const result = await pool.request().query(sqlText);
  return (result.recordset ?? []) as Record<string, unknown>[];
}

export type EtlResult = { periodo: string; idEmpresas: number };

/**
 * ETL ventas netas (SP SQL Server). En Postgres los datos ya están en meta_venta_neta.
 */
export async function runEtlVentasNetaDetalle(
  periodoOverride?: string | null
): Promise<EtlResult> {
  if (isPostgresDb()) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const periodos =
      (periodoOverride && periodoOverride.trim()) ||
      readDbEnv("SYNC_PERIODOS") ||
      `${y}${m}`;
    return {
      periodo: periodos,
      idEmpresas: parseInt(readDbEnv("SYNC_ID_EMPRESAS") || "1", 10),
    };
  }

  const pool = await getMssqlPool();
  const idEmpresas = parseInt(readDbEnv("SYNC_ID_EMPRESAS") || "1", 10);
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const periodos =
    (periodoOverride && periodoOverride.trim()) ||
    readDbEnv("SYNC_PERIODOS") ||
    `${y}${m}`;

  await pool
    .request()
    .input("IDEMPRESAS", sql.Int, idEmpresas)
    .input("PERIODOS", sql.VarChar(32), periodos)
    .input("procesar", sql.Char(1), "S")
    .execute("USP_COM_VENTAS_NETA_DETALLE");

  return { periodo: periodos, idEmpresas };
}

/** Refresca META vía SP (solo SQL Server local). */
export async function syncVentasNetaDetalle(): Promise<void> {
  if (isPostgresDb()) return;
  await runEtlVentasNetaDetalle();
}
