/**
 * Prueba consulta BI (trimestre) contra Montero_db.
 */
import { loadAppEnv } from "./load-env.mjs";
import pg from "pg";
loadAppEnv();

const pgSql = `
SELECT
  anio,
  SUM(venta_neta) AS venta_neta
FROM public.meta_venta_neta
WHERE trimestre = 1 AND anio IN (2024, 2025)
GROUP BY anio
ORDER BY anio
`;
const url = process.env.PG_DATABASE_URL?.trim();
const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

console.log("SQL Postgres:\n", pgSql);
const r = await pool.query(pgSql);
console.log("Filas:", r.rows);
await pool.end();
