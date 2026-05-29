/**
 * Compara agregados entre [banda] (ERP) y vistas [GestionBI] (capa IA).
 * Uso: desde /app →  node scripts/reconcile-bi-banda.mjs
 *
 * Variables opcionales:
 *   STRICT=1  → exit 1 si falta una vista/columna o hay error SQL (default 0 = solo falla por diferencia numérica).
 *
 * Códigos: 0 OK | 1 diferencia de cifras | 2 error de despliegue (sin STRICT cuenta como advertencia y puede salir 0).
 */
import sql from "mssql";
import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

const EPS = 0.02;
const TOL_PCT = 0.005;
const STRICT = process.env.STRICT === "1";

function num(x) {
  if (x == null) return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function closeEnough(a, b) {
  const da = num(a);
  const db = num(b);
  if (Math.abs(da - db) <= EPS) return true;
  const ref = Math.max(Math.abs(da), Math.abs(db), 1);
  return Math.abs(da - db) / ref <= TOL_PCT;
}

async function biColumnExists(pool, table, col) {
  const r = await pool.request().query(`
    SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${col}';
  `);
  return (r.recordset?.length ?? 0) > 0;
}

async function bandaObjectId(pool, name) {
  const r = await pool.request().query(`
    SELECT OBJECT_ID(N'banda.dbo.${name}', 'U') AS oid;
  `);
  return r.recordset?.[0]?.oid;
}

async function bandaColumns(pool, table) {
  const r = await pool.request().query(`
    SELECT COLUMN_NAME FROM banda.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${table}'
    ORDER BY ORDINAL_POSITION;
  `);
  return (r.recordset ?? []).map((x) => x.COLUMN_NAME);
}

function pickBcoSaldoColumn(cols) {
  const order = [
    "CTA_SALDO_ACTUAL",
    "CTA_SALDO",
    "SALDO_ACTUAL",
    "CTA_SALDO_DISPONIBLE",
    "SALDO",
  ];
  const set = new Set(cols.map((c) => c.toUpperCase()));
  for (const o of order) {
    if (set.has(o)) return o;
  }
  const guess = cols.find((c) => /SALDO/i.test(c));
  return guess || null;
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
  const results = {
    valueMismatch: false,
    deployIssue: false,
    hardSqlError: false,
    checks: [],
  };

  const addCheck = (name, bandaVal, biVal, detail = "") => {
    const match = closeEnough(bandaVal, biVal);
    results.checks.push({
      name,
      banda: bandaVal,
      bi: biVal,
      match,
      detail,
    });
    if (!match) results.valueMismatch = true;
  };

  const addCheckInt = (name, bandaVal, biVal, detail = "") => {
    const match = Number(bandaVal) === Number(biVal);
    results.checks.push({
      name,
      banda: bandaVal,
      bi: biVal,
      match,
      detail,
    });
    if (!match) results.valueMismatch = true;
  };

  const addSkip = (name, msg, detail = "") => {
    results.checks.push({ name, skip: true, error: msg, detail });
    if (STRICT) results.deployIssue = true;
  };

  const addErr = (name, err, detail = "") => {
    results.checks.push({ name, error: err.message || String(err), detail });
    results.deployIssue = true;
    results.hardSqlError = true;
  };

  try {
    const hasOrigen = await biColumnExists(pool, "V_MAESTRA_VENTAS", "ORIGEN");
    const hasBancosView =
      (await pool.request().query(`SELECT OBJECT_ID('dbo.V_MAESTRA_BANCOS','V') AS i`))
        .recordset?.[0]?.i != null;
    const hasCxPView =
      (await pool.request().query(`SELECT OBJECT_ID('dbo.V_MAESTRA_CUENTAS_PAGAR','V') AS i`))
        .recordset?.[0]?.i != null;

    console.log("\n=== Preflight ===");
    console.log(`  V_MAESTRA_VENTAS.ORIGEN: ${hasOrigen ? "sí" : "NO — ejecuta domentacion/bbdd/GestionBI_IA_capa_completa.sql"}`);
    console.log(`  V_MAESTRA_BANCOS: ${hasBancosView ? "sí" : "no"}`);
    console.log(`  V_MAESTRA_CUENTAS_PAGAR: ${hasCxPView ? "sí" : "no"}`);

    const provOid = await bandaObjectId(pool, "FAC_FACT_PROV");
    console.log(`  banda.dbo.FAC_FACT_PROV: ${provOid ? "sí" : "NO (tabla ausente u otro nombre)"}`);

    let bcoCols = [];
    try {
      bcoCols = await bandaColumns(pool, "BCO");
      console.log(`  banda.BCO columnas (muestra): ${bcoCols.slice(0, 8).join(", ") || "—"}`);
    } catch {
      console.log("  banda.BCO: no se pudieron listar columnas (¿permisos en banda?)");
    }

    /* ── 1) Ventas LIVE hoy ── */
    const qBandaLive = `
      SELECT
        CAST(ISNULL(SUM(fmo.FMO_PRECIO_NETO), 0) AS DECIMAL(18,2)) AS venta_neta,
        COUNT_BIG(*) AS lineas
      FROM banda.dbo.FAC_MOVIMIENTOS fmo
      INNER JOIN banda.dbo.FAC_FACTURAS ffg
        ON fmo.FMO_SERIE = ffg.FFG_SERIE AND fmo.FMO_NUMERO = ffg.FFG_NUMERO
      WHERE ISNULL(ffg.FFG_ANULADO, 0) = 0
        AND fmo.FMO_TIPO IN (40, 60)
        AND CAST(fmo.FMO_FECHA AS DATE) = CAST(GETDATE() AS DATE);
    `;

    let rB;
    try {
      rB = (await pool.request().query(qBandaLive)).recordset?.[0];
    } catch (e) {
      addErr("ventas_LIVE_hoy.banda", e, "FAC_MOVIMIENTOS / FAC_FACTURAS");
      rB = null;
    }

    if (hasOrigen && rB) {
      try {
        const rV = (
          await pool.request().query(`
            SELECT
              CAST(ISNULL(SUM(VENTA_NETA), 0) AS DECIMAL(18,2)) AS venta_neta,
              COUNT_BIG(*) AS lineas
            FROM dbo.V_MAESTRA_VENTAS
            WHERE ORIGEN = 'LIVE'
              AND CAST(FECHA AS DATE) = CAST(GETDATE() AS DATE);
          `)
        ).recordset?.[0];
        addCheck("ventas_LIVE_hoy.venta_neta", rB.venta_neta, rV.venta_neta);
        addCheckInt("ventas_LIVE_hoy.lineas", rB.lineas, rV.lineas);
      } catch (e) {
        addErr("ventas_LIVE_hoy.bi", e);
      }
    } else if (rB) {
      addSkip(
        "ventas_LIVE_hoy",
        "Sin columna ORIGEN en V_MAESTRA_VENTAS",
        `Solo banda hoy: venta_neta=${rB.venta_neta}, lineas=${rB.lineas} (compara tras desplegar capa IA)`
      );
    }

    /* ── 2) Bancos ── */
    const saldoCol = pickBcoSaldoColumn(bcoCols);
    if (!hasBancosView || !saldoCol) {
      addSkip(
        "bancos.suma_saldos",
        !hasBancosView ? "Falta V_MAESTRA_BANCOS" : "No se detectó columna de saldo en banda.BCO",
        "Despliega GestionBI_IA_capa_completa.sql y revisa nombres en BCO"
      );
    } else {
      try {
        const bBco = (
          await pool.request().query(`
            SELECT CAST(ISNULL(SUM([${saldoCol}]), 0) AS DECIMAL(18,2)) AS t
            FROM banda.dbo.BCO;
          `)
        ).recordset?.[0]?.t;
        const vBco = (
          await pool.request().query(`
            SELECT CAST(ISNULL(SUM(SALDO_ACTUAL), 0) AS DECIMAL(18,2)) AS t
            FROM dbo.V_MAESTRA_BANCOS;
          `)
        ).recordset?.[0]?.t;
        addCheck(`bancos.suma_saldos(${saldoCol})`, bBco, vBco);
      } catch (e) {
        addErr("bancos.suma_saldos", e, "Ajusta V_MAESTRA_BANCOS a columnas reales de BCO");
      }
    }

    /* ── 3) Cartera: banda vs vista (la vista antigua puede romper por FCC_RETENCION / tipos) ── */
    let bCxC = null;
    try {
      bCxC = (
        await pool.request().query(`
          SELECT CAST(ISNULL(SUM(
            ISNULL(TRY_CONVERT(DECIMAL(18,2), fcc.FCC_VALOR), 0)
            - ISNULL(TRY_CONVERT(DECIMAL(18,2), fcc.FCC_PAGADO), 0)
          ), 0) AS DECIMAL(18,2)) AS t
          FROM banda.dbo.FAC_CARTERA fcc
          WHERE LTRIM(RTRIM(ISNULL(CAST(fcc.FCC_STATUS AS VARCHAR(20)), 'P'))) <> 'C';
        `)
      ).recordset?.[0]?.t;
    } catch (e) {
      addErr("cartera.banda_saldo", e);
    }

    let vCxC = null;
    if (bCxC != null) {
      try {
        vCxC = (
          await pool.request().query(`
            SELECT CAST(ISNULL(SUM(SALDO_PENDIENTE), 0) AS DECIMAL(18,2)) AS t
            FROM dbo.V_MAESTRA_CARTERA;
          `)
        ).recordset?.[0]?.t;
      } catch (e) {
        addSkip(
          "cartera.saldo_pendiente_total",
          "V_MAESTRA_CARTERA en BD no actualizada (error al agregar)",
          `Solo banda=${bCxC}. Redespliega cartera desde GestionBI_IA_capa_completa.sql — ${e.message}`
        );
      }
    }
    if (bCxC != null && vCxC != null) {
      addCheck("cartera.saldo_pendiente_total", bCxC, vCxC);
    }

    /* ── 4) CxP ── */
    if (!provOid || !hasCxPView) {
      addSkip(
        "cuentas_pagar.saldo_vivo",
        "FAC_FACT_PROV o vista CxP no disponible",
        "Crea la tabla en banda o ajusta el nombre en el script SQL"
      );
    } else {
      try {
        const bCxP = (
          await pool.request().query(`
            SELECT CAST(ISNULL(SUM(FFP_CARTERA), 0) AS DECIMAL(18,2)) AS t
            FROM banda.dbo.FAC_FACT_PROV fp
            WHERE ISNULL(fp.FFP_ANULADO, 0) = 0 AND ISNULL(fp.FFP_CARTERA, 0) > 0;
          `)
        ).recordset?.[0]?.t;
        const vCxP = (
          await pool.request().query(`
            SELECT CAST(ISNULL(SUM(SALDO_PENDIENTE), 0) AS DECIMAL(18,2)) AS t
            FROM dbo.V_MAESTRA_CUENTAS_PAGAR;
          `)
        ).recordset?.[0]?.t;
        addCheck("cuentas_pagar.saldo_vivo", bCxP, vCxP);
      } catch (e) {
        addErr("cuentas_pagar.saldo_vivo", e, "Columnas FFP_* pueden diferir en tu ERP");
      }
    }

    /* ── 5) WAREHOUSE META vs vista ── */
    try {
      const per = (
        await pool.request().query(`
          SELECT TOP 1 PERIODO FROM dbo.META_VENTA_NETA ORDER BY PERIODO DESC;
        `)
      ).recordset?.[0]?.PERIODO;
      if (per) {
        const perStr = String(per);
        const r1 = pool.request();
        r1.input("per", sql.VarChar(6), perStr);
        const rMeta = (
          await r1.query(`
            SELECT CAST(ISNULL(SUM(VENTA_NETA), 0) AS DECIMAL(18,2)) AS t
            FROM dbo.META_VENTA_NETA WHERE PERIODO = @per;
          `)
        ).recordset?.[0]?.t;

        if (hasOrigen) {
          const r2 = pool.request();
          r2.input("per", sql.VarChar(6), perStr);
          const rVw = (
            await r2.query(`
              SELECT CAST(ISNULL(SUM(VENTA_NETA), 0) AS DECIMAL(18,2)) AS t
              FROM dbo.V_MAESTRA_VENTAS
              WHERE ORIGEN = 'WAREHOUSE' AND PERIODO = @per;
            `)
          ).recordset?.[0]?.t;
          addCheck("warehouse.venta_neta_ultimo_periodo", rMeta, rVw, `PERIODO=${perStr}`);
        } else {
          const r2 = pool.request();
          r2.input("per", sql.VarChar(6), perStr);
          const rAll = (
            await r2.query(`
              SELECT CAST(ISNULL(SUM(VENTA_NETA), 0) AS DECIMAL(18,2)) AS t
              FROM dbo.V_MAESTRA_VENTAS WHERE PERIODO = @per;
            `)
          ).recordset?.[0]?.t;
          addCheck("warehouse.meta_vs_vista_sin_origen", rMeta, rAll, `PERIODO=${perStr} (vista sin ORIGEN)`);
        }
      }
    } catch (e) {
      addErr("warehouse.meta_vs_vista", e);
    }
  } finally {
    await pool.close();
  }

  console.log("\n=== Reconciliación banda ↔ GestionBI ===\n");
  for (const c of results.checks) {
    if (c.skip) {
      console.log(`○ ${c.name}: OMITIDO — ${c.error}`);
      if (c.detail) console.log(`  ${c.detail}`);
      continue;
    }
    if (c.error && c.banda === undefined) {
      console.log(`✖ ${c.name}: ERROR — ${c.error}`);
      if (c.detail) console.log(`  ${c.detail}`);
      continue;
    }
    const icon = c.match ? "✓" : "✖";
    console.log(
      `${icon} ${c.name}: banda=${c.banda}  BI=${c.bi}  ${c.match ? "OK" : "DIFIERE"}`
    );
    if (c.detail) console.log(`  ${c.detail}`);
  }
  console.log("");

  let code = 0;
  if (results.valueMismatch) code = 1;
  else if (results.hardSqlError) code = 2;
  else if (STRICT && results.deployIssue) code = 2;

  if (code === 1) {
    console.log("Hay diferencias numéricas entre banda y las vistas BI. Revisa filtros o despliegue.\n");
  }
  if (code === 2) {
    console.log("Hubo errores SQL u omisiones críticas. Corrige vistas o permisos; o usa STRICT=0 solo para preflight.\n");
  }

  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
