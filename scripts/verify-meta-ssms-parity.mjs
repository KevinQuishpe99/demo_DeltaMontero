/**
 * Paridad con consultas típicas de SSMS sobre META_VENTA_NETA (capturas de usuario).
 *
 * Ejecuta 3 bloques alineados con las imágenes:
 *   1) Ventas por cliente pivot 2024 / 2025 (YEAR(FECHA) o ANIO si existe)
 *   2) % participación de cada cliente en total venta (PERIODO 202401)
 *   3) Margen % = SUM(UTILIDAD)/SUM(VENTA_NETA)*100 por cliente (PERIODO 202401)
 *
 * Uso (desde la raíz del proyecto app/):
 *   npm run test:meta-ssms-parity
 *   META_VERIFY_PERIODO=202401 META_VERIFY_ANIOS=2024,2025 npm run test:meta-ssms-parity
 *
 * Requiere .env con DB_* (misma conexión que la app). Tabla por defecto:
 *   [GestionBI].[dbo].[META_VENTA_NETA]
 * Override: META_TABLE="[GestionBI].[dbo].[META_VENTA_NETA]"
 */
import sql from "mssql";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadAppEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadAppEnv();

const META_TABLE =
  process.env.META_TABLE?.trim() || "[GestionBI].[dbo].[META_VENTA_NETA]";
const PERIODO = process.env.META_VERIFY_PERIODO?.trim() || "202401";
const ANIOS = (process.env.META_VERIFY_ANIOS || "2024,2025")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));

if (ANIOS.length < 2) {
  console.error("META_VERIFY_ANIOS debe tener al menos dos años, ej. 2024,2025");
  process.exit(1);
}

function sampleRows(rows, n = 3) {
  return (rows ?? []).slice(0, n);
}

async function main() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "GestionBI",
    server: process.env.DB_SERVER || "localhost",
    port: parseInt(process.env.DB_PORT || "1433", 10),
    connectionTimeout: 30000,
    requestTimeout: 120000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };

  if (!config.user || config.password === undefined) {
    console.error("Falta DB_USER / DB_PASSWORD en .env");
    process.exit(1);
  }

  const pool = await new sql.ConnectionPool(config).connect();
  const req = () => pool.request();

  /** Nombre tipo GestionBI.dbo.META_VENTA_NETA para COL_LENGTH / OBJECT_ID */
  function metaThreePartName() {
    const parts = [...META_TABLE.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
    if (parts.length >= 3) return `${parts[0]}.${parts[1]}.${parts[2]}`;
    if (parts.length === 2) return `${config.database}.${parts[0]}.${parts[1]}`;
    if (parts.length === 1) return `${config.database}.dbo.${parts[0]}`;
    return `${config.database}.dbo.META_VENTA_NETA`;
  }

  async function metaHasColumn(col) {
    const full = metaThreePartName();
    const r = await req().query(
      `SELECT COL_LENGTH(N'${full.replace(/'/g, "''")}', N'${col.replace(/'/g, "''")}') AS cl`
    );
    const cl = r.recordset?.[0]?.cl;
    return cl != null && cl !== undefined;
  }

  const hasAnio = await metaHasColumn("ANIO");
  const hasPeriodo = await metaHasColumn("PERIODO");

  console.log("\n=== verify-meta-ssms-parity ===");
  console.log(`  DB: ${config.server} / ${config.database}`);
  console.log(`  META_TABLE: ${META_TABLE}`);
  console.log(`  PERIODO test: ${PERIODO}  ANIOS: ${ANIOS.join(",")}`);
  console.log(`  Columnas META: ANIO=${hasAnio ? "sí" : "no"}  PERIODO=${hasPeriodo ? "sí" : "no"}\n`);

  const gateChecks = [];
  const y0 = ANIOS[0];
  const y1 = ANIOS[1];
  const sql1 = hasAnio
    ? `
SELECT TOP 5
  NOMBRE_COMPLETO,
  SUM(IIF(ANIO = ${y0}, VENTA_NETA, 0)) AS venta_${y0},
  SUM(IIF(ANIO = ${y1}, VENTA_NETA, 0)) AS venta_${y1}
FROM ${META_TABLE} WITH (NOLOCK)
WHERE ANIO IN (${y0},${y1})
GROUP BY NOMBRE_COMPLETO
ORDER BY SUM(IIF(ANIO = ${y0}, VENTA_NETA, 0)) + SUM(IIF(ANIO = ${y1}, VENTA_NETA, 0)) DESC;
`.trim()
    : `
SELECT TOP 5
  NOMBRE_COMPLETO,
  SUM(IIF(YEAR(FECHA) = ${y0}, VENTA_NETA, 0)) AS venta_${y0},
  SUM(IIF(YEAR(FECHA) = ${y1}, VENTA_NETA, 0)) AS venta_${y1}
FROM ${META_TABLE} WITH (NOLOCK)
WHERE YEAR(FECHA) IN (${y0},${y1})
GROUP BY NOMBRE_COMPLETO
ORDER BY SUM(IIF(YEAR(FECHA) = ${y0}, VENTA_NETA, 0)) + SUM(IIF(YEAR(FECHA) = ${y1}, VENTA_NETA, 0)) DESC;
`.trim();

  const periodoWhere = hasPeriodo
    ? "CAST(PERIODO AS VARCHAR(12)) = @p"
    : "(YEAR(FECHA)*100+MONTH(FECHA)) = CAST(@p AS INT)";

  const sql2 = `
SELECT TOP 5 *
FROM (
  SELECT NOMBRE_COMPLETO,
    SUM(VENTA_NETA) / NULLIF((SELECT SUM(VENTA_NETA) FROM ${META_TABLE} WITH (NOLOCK) WHERE ${periodoWhere}), 0) * 100.0 AS porcentaje
  FROM ${META_TABLE} WITH (NOLOCK)
  WHERE ${periodoWhere}
  GROUP BY NOMBRE_COMPLETO
) d
ORDER BY porcentaje DESC;
`.trim();

  const sql3 = `
SELECT TOP 5
  NOMBRE_COMPLETO,
  IIF(SUM(VENTA_NETA) = 0, 0, SUM(UTILIDAD) / NULLIF(SUM(VENTA_NETA), 0) * 100.0) AS margen_pct
FROM ${META_TABLE} WITH (NOLOCK)
WHERE ${periodoWhere}
GROUP BY NOMBRE_COMPLETO
ORDER BY NOMBRE_COMPLETO;
`.trim();

  for (const label of ["sql1_pivot", "sql2_pct", "sql3_margen"]) {
    const s = label === "sql1_pivot" ? sql1 : label === "sql2_pct" ? sql2 : sql3;
    const u = s.toUpperCase().replace(/\s+/g, " ");
    if (u.includes("V_MAESTRA_VENTAS"))
      gateChecks.push(`${label}: contiene V_MAESTRA_VENTAS (rechazado en consultar_comercial)`);
    if (!u.includes("META_VENTA_NETA"))
      gateChecks.push(`${label}: no referencia META_VENTA_NETA`);
  }
  if (gateChecks.length) {
    console.error("Gate comercial (heurística):");
    gateChecks.forEach((e) => console.error("  ❌", e));
    process.exit(1);
  }
  console.log("Gate comercial (heurística): OK (META, sin V_MAESTRA_VENTAS)\n");

  try {
    const r1 = await req().query(sql1);
    console.log("--- 1) Pivot ANIO (TOP 5 por volumen) ---");
    console.table(sampleRows(r1.recordset, 5));

    const r2 = await req().input("p", sql.VarChar(12), PERIODO).query(sql2);
    console.log("--- 2) % participación PERIODO (TOP 5) ---");
    console.table(sampleRows(r2.recordset, 5));

    const r3 = await req().input("p", sql.VarChar(12), PERIODO).query(sql3);
    console.log("--- 3) Margen % por cliente PERIODO (TOP 5 alfabético) ---");
    console.table(sampleRows(r3.recordset, 5));

    if (hasPeriodo) {
      const pInt = parseInt(PERIODO, 10);
      const cmp = await req()
        .input("pStr", sql.VarChar(12), PERIODO)
        .input("pInt", sql.Int, pInt)
        .query(`
        SELECT
          (SELECT COUNT(*) FROM ${META_TABLE} WITH (NOLOCK) WHERE CAST(PERIODO AS VARCHAR(12)) = @pStr) AS filas_where_varchar,
          (SELECT COUNT(*) FROM ${META_TABLE} WITH (NOLOCK) WHERE PERIODO = @pInt) AS filas_where_int;
      `);
      const row = cmp.recordset?.[0];
      if (
        row &&
        Number(row.filas_where_varchar) !== Number(row.filas_where_int)
      ) {
        console.warn(
          `\n⚠ Aviso: PERIODO VARCHAR ('${PERIODO}') vs INT (${pInt}) devuelve distinto COUNT(*). Alinea el filtro con tu SSMS.`
        );
      }
    }

    const out = path.join(__dirname, "..", "tests", "report-meta-ssms-parity.txt");
    const lines = [
      `server=${config.server} db=${config.database} table=${META_TABLE}`,
      `periodo=${PERIODO}`,
      "",
      "Q1 sample:",
      JSON.stringify(sampleRows(r1.recordset, 5), null, 2),
      "",
      "Q2 sample:",
      JSON.stringify(sampleRows(r2.recordset, 5), null, 2),
      "",
      "Q3 sample:",
      JSON.stringify(sampleRows(r3.recordset, 5), null, 2),
      "",
    ];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join("\n"), "utf8");
    console.log(`\nMuestra guardada en ${out}`);
  } catch (e) {
    console.error("Error SQL:", e.message || e);
    process.exit(1);
  } finally {
    await pool.close();
  }

  console.log("\nOK. Compara números con tu SSMS en el mismo servidor/base.");
}

main();
