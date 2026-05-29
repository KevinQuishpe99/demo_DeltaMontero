/**
 * Prueba de conexión a PostgreSQL (Montero_db en Azure).
 * Uso: node scripts/test-pg-connection.mjs
 */
import pg from "pg";
import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

const KEY_TABLES = [
  "meta_venta_neta",
  "fac_facturas",
  "fac_cartera",
  "fac_stock",
  "bco",
];

function buildPoolConfig() {
  const url = process.env.PG_DATABASE_URL?.trim();
  const sslEnabled = process.env.DB_SSL?.trim().toLowerCase() === "true";
  const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;
  const max = parseInt(process.env.DB_POOL_MAX || "2", 10);
  const connectionTimeoutMillis = parseInt(
    process.env.DB_CONNECTION_TIMEOUT_MS || "30000",
    10
  );

  if (url) {
    return { connectionString: url, ssl, max, connectionTimeoutMillis };
  }

  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  const port = parseInt(process.env.DB_PORT || "5432", 10);

  if (!host || !user || !password || !database) {
    console.error(
      "Faltan variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o PG_DATABASE_URL)"
    );
    process.exit(1);
  }

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    max,
    connectionTimeoutMillis,
  };
}

function ok(label, detail) {
  console.log(`  OK  ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  FAIL ${label}: ${msg}`);
}

async function main() {
  const cfg = buildPoolConfig();
  const pool = new pg.Pool(cfg);
  let passed = 0;
  let failed = 0;

  console.log("=== Test conexión PostgreSQL (Montero_db) ===");
  console.log(`Host: ${cfg.host ?? "(PG_DATABASE_URL)"}`);
  console.log(`Base: ${cfg.database ?? process.env.DB_NAME ?? "?"}`);
  console.log("");

  try {
    const client = await pool.connect();
    try {
      const version = await client.query("SELECT version() AS v");
      ok("Conexión", version.rows[0]?.v?.split(",")[0] ?? "conectado");
      passed += 1;

      const db = await client.query("SELECT current_database() AS db");
      ok("Base activa", db.rows[0]?.db);
      passed += 1;

      if (db.rows[0]?.db !== process.env.DB_NAME?.trim()) {
        fail(
          "Nombre de base",
          new Error(
            `Esperado ${process.env.DB_NAME}, recibido ${db.rows[0]?.db}`
          )
        );
        failed += 1;
      } else {
        ok("Nombre de base coincide con DB_NAME");
        passed += 1;
      }

      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      ok("Tablas en public", `${tables.rows.length} tablas`);
      passed += 1;

      for (const t of KEY_TABLES) {
        const found = tables.rows.some((r) => r.table_name === t);
        if (found) {
          const count = await client.query(
            `SELECT COUNT(*)::bigint AS n FROM public.${t}`
          );
          ok(`Tabla ${t}`, `${count.rows[0]?.n ?? 0} filas`);
          passed += 1;
        } else {
          fail(`Tabla ${t}`, new Error("no existe en public"));
          failed += 1;
        }
      }

      if (tables.rows.some((r) => r.table_name === "meta_venta_neta")) {
        const meta = await client.query(`
          SELECT
            MIN(anio) AS anio_min,
            MAX(anio) AS anio_max,
            COUNT(*)::bigint AS total
          FROM public.meta_venta_neta
        `);
        const row = meta.rows[0];
        ok(
          "meta_venta_neta (rango)",
          `años ${row.anio_min ?? "?"}–${row.anio_max ?? "?"}, ${row.total} registros`
        );
        passed += 1;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    fail("Conexión", err);
    failed += 1;
  } finally {
    await pool.end().catch(() => {});
  }

  console.log("");
  console.log(`Resultado: ${passed} OK, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
