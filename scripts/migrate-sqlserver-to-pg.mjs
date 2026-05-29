/**
 * Migra tablas CORA: SQL Server (bandavanoni_new_2018_resp) → PostgreSQL Montero_db.
 *
 * Uso:
 *   PG_DATABASE_URL=postgresql://... node scripts/migrate-sqlserver-to-pg.mjs --status
 *   PG_DATABASE_URL=postgresql://... node scripts/migrate-sqlserver-to-pg.mjs --table meta_venta_neta
 *   PG_DATABASE_URL=postgresql://... node scripts/migrate-sqlserver-to-pg.mjs --all
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sql from "mssql";
import pg from "pg";
import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const BATCH = parseInt(process.env.MIGRATE_BATCH_SIZE || "2000", 10);

/** Origen SQL Server → destino Postgres (ya creado en montero_pg_schema.sql). */
const TABLES = [
  { mssql: "FAC_LOCALES", pg: "fac_locales" },
  { mssql: "FAC_VEND", pg: "fac_vend" },
  { mssql: "FAC_BIEN_SERV", pg: "fac_bien_serv" },
  { mssql: "FAC_CLIENTES", pg: "fac_clientes" },
  { mssql: "BCO", pg: "bco" },
  { mssql: "FAC_COMPRAS", pg: "fac_compras" },
  { mssql: "FAC_COMPRA", pg: "fac_compra" },
  { mssql: "FAC_COMPRA_DETALLE", pg: "fac_compra_detalle" },
  { mssql: "FAC_DET_PAGOS_PROVEEDOR", pg: "fac_det_pagos_proveedor" },
  { mssql: "FAC_CHE_PROVEEDORES", pg: "fac_che_proveedores" },
  { mssql: "FAC_FACTURAS", pg: "fac_facturas" },
  { mssql: "FAC_FACTURA_DETALLE", pg: "fac_factura_detalle" },
  { mssql: "FAC_CARTERA", pg: "fac_cartera" },
  { mssql: "FAC_CIERRE_CAJA", pg: "fac_cierre_caja" },
  { mssql: "FAC_RETENCIONES_SRI", pg: "fac_retenciones_sri" },
  { mssql: "meta_venta_neta", pg: "meta_venta_neta" },
  { mssql: "FAC_STOCK", pg: "fac_stock" },
  { mssql: "FAC_MOVIMIENTOS", pg: "fac_movimientos" },
  { mssql: "TES_FLUJO", pg: "tes_flujo" },
  { mssql: "TES_CAJA", pg: "tes_caja" },
];

function pgUrl() {
  const url = process.env.PG_DATABASE_URL?.trim();
  if (!url) {
    console.error("Falta PG_DATABASE_URL en .env / .env.local");
    process.exit(1);
  }
  return url;
}

function mssqlConfig() {
  const server = process.env.MSSQL_SERVER?.trim() || process.env.DB_SERVER?.trim();
  const database =
    process.env.MSSQL_DATABASE?.trim() ||
    (server ? process.env.DB_NAME?.trim() : null) ||
    "bandavanoni_new_2018_resp";
  if (!server) {
    throw new Error(
      "Falta MSSQL_SERVER (origen SQL Server local). Ej.: MSSQL_SERVER=localhost MSSQL_USER=sa MSSQL_DATABASE=bandavanoni_new_2018_resp"
    );
  }
  return {
    user: process.env.MSSQL_USER?.trim() || process.env.DB_USER,
    password: process.env.MSSQL_PASSWORD ?? process.env.DB_PASSWORD,
    server,
    port: parseInt(
      process.env.MSSQL_PORT || process.env.DB_PORT || "1433",
      10
    ),
    database,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 300000,
  };
}

function normalizeRow(row, pgCols) {
  const out = {};
  const src = {};
  for (const [k, v] of Object.entries(row)) {
    src[k.toLowerCase()] = v;
  }
  for (const c of pgCols) {
    out[c] = src[c] ?? null;
  }
  return out;
}

async function pgColumns(client, pgTable) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [pgTable]
  );
  return r.rows.map((x) => x.column_name);
}

async function mssqlColumns(pool, mssqlTable) {
  const r = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${mssqlTable.replace(/'/g, "''")}'
    ORDER BY ORDINAL_POSITION`);
  return r.recordset.map((x) => x.COLUMN_NAME);
}

function buildSelect(mssqlTable, cols, offset) {
  const selectList = cols.map((c) => `[${c}]`).join(", ");
  return `
    SELECT ${selectList}
    FROM dbo.[${mssqlTable}] WITH (NOLOCK)
    ORDER BY (SELECT NULL)
    OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY`;
}

async function countMssql(pool, mssqlTable) {
  const r = await pool
    .request()
    .query(`SELECT COUNT(*) AS n FROM dbo.[${mssqlTable}] WITH (NOLOCK)`);
  return Number(r.recordset[0].n);
}

async function countPg(client, pgTable) {
  const r = await client.query(`SELECT COUNT(*)::bigint AS n FROM public.${pgTable}`);
  return Number(r.rows[0].n);
}

async function migrateOne(pool, client, { mssql, pg }, { truncate = true } = {}) {
  const pgCols = await pgColumns(client, pg);
  const msCols = await mssqlColumns(pool, mssql);
  const msLower = new Set(msCols.map((c) => c.toLowerCase()));
  const usablePg = pgCols.filter((c) => msLower.has(c));
  if (usablePg.length === 0) {
    throw new Error(`${pg}: sin columnas en común con ${mssql}`);
  }

  const total = await countMssql(pool, mssql);
  if (truncate) {
    await client.query(`TRUNCATE TABLE public.${pg} CASCADE`);
  }

  if (total === 0) {
    console.log(`  ${pg}: 0 filas (origen vacío)`);
    return { pg, total: 0, inserted: 0 };
  }

  const msSelectCols = msCols.filter((c) =>
    usablePg.includes(c.toLowerCase())
  );
  let offset = 0;
  let inserted = 0;
  const colList = usablePg.join(", ");
  const insertSql = `INSERT INTO public.${pg} (${colList}) VALUES `;

  while (offset < total) {
    const q = buildSelect(mssql, msSelectCols, offset);
    const batch = await pool.request().query(q);
    if (!batch.recordset.length) break;

    const CHUNK = Math.max(
      1,
      Math.min(400, Math.floor(6000 / usablePg.length))
    );
    for (let i = 0; i < batch.recordset.length; i += CHUNK) {
      const slice = batch.recordset.slice(i, i + CHUNK);
      const params = [];
      let p = 1;
      const tuples = slice.map((row) => {
        const vals = normalizeRow(row, usablePg);
        const ph = usablePg.map(() => `$${p++}`);
        params.push(...usablePg.map((c) => vals[c]));
        return `(${ph.join(", ")})`;
      });
      await client.query(insertSql + tuples.join(", "), params);
      inserted += slice.length;
    }

    offset += batch.recordset.length;
    process.stdout.write(
      `\r  ${pg}: ${inserted}/${total} (${Math.round((inserted / total) * 100)}%)`
    );
    if (batch.recordset.length < BATCH) break;
  }
  console.log("");
  return { pg, total, inserted };
}

async function status(pool, client) {
  console.log("=== Estado migración SQL Server → Montero_db ===\n");
  console.log(
    `${"Tabla".padEnd(28)} ${"SQL Server".padStart(12)} ${"Postgres".padStart(12)} ${"OK".padStart(6)}`
  );
  console.log("-".repeat(62));
  for (const t of TABLES) {
    const ms = await countMssql(pool, t.mssql);
    const pgN = await countPg(client, t.pg);
    const ok = ms === pgN ? "✓" : ms > 0 && pgN === 0 ? "FALTA" : "≠";
    console.log(
      `${t.pg.padEnd(28)} ${String(ms).padStart(12)} ${String(pgN).padStart(12)} ${ok.padStart(6)}`
    );
  }
}

async function applySchema(client) {
  const ddl = fs.readFileSync(
    path.join(root, "scripts/sql/montero_pg_schema.sql"),
    "utf8"
  );
  await client.query(ddl);
  console.log("Esquema aplicado desde montero_pg_schema.sql");
}

async function main() {
  const args = process.argv.slice(2);
  const pgClient = new pg.Client({ connectionString: pgUrl() });
  await pgClient.connect();

  const cfg = mssqlConfig();
  const pool = await sql.connect(cfg);
  console.log(`Origen: ${cfg.database} @ ${cfg.server}`);
  console.log(`Destino: ${pgUrl().replace(/:[^:@/]+@/, ":****@")}\n`);

  try {
    if (args.includes("--apply-schema")) {
      await applySchema(pgClient);
      return;
    }

    if (args.includes("--status")) {
      await status(pool, pgClient);
      return;
    }

    const tableArg = args.find((a) => a.startsWith("--table="))?.slice(8)
      ?? (args.includes("--table") ? args[args.indexOf("--table") + 1] : null);

    const selected = tableArg
      ? TABLES.filter((t) => t.pg === tableArg || t.mssql === tableArg)
      : args.includes("--all")
        ? TABLES
        : null;

    if (!selected?.length) {
      console.log(`Uso: --status | --apply-schema | --table <nombre> | --all`);
      console.log(`Tablas: ${TABLES.map((t) => t.pg).join(", ")}`);
      process.exit(1);
    }

    for (const t of selected) {
      console.log(`Migrando ${t.mssql} → ${t.pg}...`);
      const r = await migrateOne(pool, pgClient, t);
      console.log(`  OK: ${r.inserted} filas`);
    }

    console.log("\n--- Resumen ---");
    await status(pool, pgClient);
  } finally {
    await pool.close();
    await pgClient.end();
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
