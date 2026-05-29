/**
 * Migración única: clientes Odoo (res.partner, customer_rank > 0) → SQL Server dbo.odoo_partner.
 * Uso (desde /app): node scripts/migrate-odoo-partners.mjs
 *
 * Variables en .env (ver .env.example). No subas claves a git.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sql from "mssql";
import { loadAppEnv } from "./load-env.mjs";

loadAppEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SIZE = parseInt(process.env.ODOO_PARTNER_PAGE_SIZE || "5000", 10);

const DDL_PATH = path.join(__dirname, "sql", "odoo_partner.sql");

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta variable de entorno ${name}`);
  return v;
}

async function odooJsonRpc(baseUrl, payload) {
  const url = `${baseUrl.replace(/\/+$/, "")}/jsonrpc`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", ...payload, id: Date.now() }),
  });
  if (!res.ok) {
    throw new Error(`Odoo HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(
      `Odoo RPC error: ${body.error.message || JSON.stringify(body.error)}`
    );
  }
  return body.result;
}

async function odooLogin(baseUrl, db, login, password) {
  return odooJsonRpc(baseUrl, {
    method: "call",
    params: {
      service: "common",
      method: "login",
      args: [db, login, password],
    },
  });
}

/**
 * @param {number} uid
 * @param {string} password API key o contraseña
 * @param {number} offset
 */
async function odooSearchReadPartners(
  baseUrl,
  db,
  uid,
  password,
  offset
) {
  const kwargs = {
    fields: [
      "id",
      "name",
      "vat",
      "email",
      "phone",
      "city",
      "street",
      "state_id",
      "country_id",
      "user_id",
      "customer_rank",
    ],
    limit: PAGE_SIZE,
    offset,
  };
  return odooJsonRpc(baseUrl, {
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        db,
        uid,
        password,
        "res.partner",
        "search_read",
        [[["customer_rank", ">", 0]]],
        kwargs,
      ],
    },
  });
}

/** Many2one Odoo: [id, nombre] o false */
function m2oLabel(v) {
  if (!v) return null;
  if (Array.isArray(v) && v.length >= 2) {
    const label = v[1];
    return label != null ? String(label).trim() || null : String(v[0]);
  }
  return String(v);
}

function mapPartner(p) {
  return {
    odoo_id: p.id,
    name: p.name ?? null,
    vat: p.vat ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    city: p.city ?? null,
    street: p.street ?? null,
    state_name: m2oLabel(p.state_id),
    country_name: m2oLabel(p.country_id),
    user_name: m2oLabel(p.user_id),
    customer_rank:
      p.customer_rank != null ? parseInt(String(p.customer_rank), 10) : null,
  };
}

async function ensureTable(pool) {
  if (!fs.existsSync(DDL_PATH)) {
    throw new Error(`No se encontró ${DDL_PATH}`);
  }
  let ddl = fs.readFileSync(DDL_PATH, "utf8");
  ddl = ddl.replace(/^\s*GO\s*$/gim, "");
  await pool.request().query(ddl);
}

async function mergeBatch(pool, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    odoo_id: r.odoo_id,
    name: r.name,
    vat: r.vat,
    email: r.email,
    phone: r.phone,
    city: r.city,
    street: r.street,
    state_name: r.state_name,
    country_name: r.country_name,
    user_name: r.user_name,
    customer_rank: r.customer_rank,
  }));
  const json = JSON.stringify(payload);
  const req = pool.request();
  req.input("batch", sql.NVarChar(sql.MAX), json);
  const q = `
MERGE dbo.odoo_partner AS t
USING (
  SELECT
    odoo_id,
    name,
    vat,
    email,
    phone,
    city,
    street,
    state_name,
    country_name,
    user_name,
    customer_rank
  FROM OPENJSON(@batch) WITH (
    odoo_id        INT            '$.odoo_id',
    name           NVARCHAR(512)  '$.name',
    vat            NVARCHAR(64)   '$.vat',
    email          NVARCHAR(256)  '$.email',
    phone          NVARCHAR(128)  '$.phone',
    city           NVARCHAR(128)  '$.city',
    street         NVARCHAR(512)  '$.street',
    state_name     NVARCHAR(256)  '$.state_name',
    country_name   NVARCHAR(256)  '$.country_name',
    user_name      NVARCHAR(256)  '$.user_name',
    customer_rank  INT            '$.customer_rank'
  )
) AS s ON t.odoo_id = s.odoo_id
WHEN MATCHED THEN UPDATE SET
  name = s.name,
  vat = s.vat,
  email = s.email,
  phone = s.phone,
  city = s.city,
  street = s.street,
  state_name = s.state_name,
  country_name = s.country_name,
  user_name = s.user_name,
  customer_rank = s.customer_rank,
  migrated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
  odoo_id, name, vat, email, phone, city, street,
  state_name, country_name, user_name, customer_rank
) VALUES (
  s.odoo_id, s.name, s.vat, s.email, s.phone, s.city, s.street,
  s.state_name, s.country_name, s.user_name, s.customer_rank
);
`;
  await req.query(q);
  return rows.length;
}

async function main() {
  const baseUrl = requireEnv("ODOO_BASE_URL");
  const db = requireEnv("ODOO_DB");
  let uid = parseInt(process.env.ODOO_UID || "0", 10);
  const password = requireEnv("ODOO_PASSWORD");
  const login = process.env.ODOO_LOGIN?.trim();

  if (!uid && login) {
    uid = await odooLogin(baseUrl, db, login, password);
    if (!uid || typeof uid !== "number") {
      throw new Error("Login Odoo falló: uid inválido");
    }
    console.info(`[odoo] login OK, uid=${uid}`);
  } else if (!uid) {
    throw new Error("Define ODOO_LOGIN+ODOO_PASSWORD o ODOO_UID+ODOO_PASSWORD");
  }

  const sqlConfig = {
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    server: process.env.DB_SERVER || "localhost",
    port: parseInt(process.env.DB_PORT || "1433", 10),
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };

  const pool = await new sql.ConnectionPool(sqlConfig).connect();
  try {
    await ensureTable(pool);
    console.info("[sql] tabla dbo.odoo_partner lista");

    let offset = 0;
    let total = 0;
    for (;;) {
      const partners = await odooSearchReadPartners(
        baseUrl,
        db,
        uid,
        password,
        offset
      );
      if (!Array.isArray(partners) || partners.length === 0) break;
      const mapped = partners.map(mapPartner);
      const n = await mergeBatch(pool, mapped);
      total += n;
      console.info(`[odoo] offset=${offset} filas=${n} (acumulado ${total})`);
      if (partners.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.info(`[odoo] migración terminada. Total filas procesadas: ${total}`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
