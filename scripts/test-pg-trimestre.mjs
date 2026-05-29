import { loadAppEnv } from "./load-env.mjs";
import pg from "pg";

loadAppEnv();

const sql = `
SELECT anio, SUM(venta_neta)::numeric AS venta_neta
FROM public.meta_venta_neta
WHERE trimestre = 1 AND anio IN (2022, 2023, 2024, 2025)
GROUP BY anio ORDER BY anio
`;

const pool = new pg.Pool({
  connectionString: process.env.PG_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const r = await pool.query(sql);
console.log(r.rows);
await pool.end();
