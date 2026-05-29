-- Contactos Odoo (migración inicial). Ejecutar una vez o dejar que lo cree el script migrate-odoo-partners.mjs
IF OBJECT_ID(N'dbo.odoo_partner', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.odoo_partner (
    odoo_id         INT            NOT NULL CONSTRAINT PK_odoo_partner PRIMARY KEY,
    name            NVARCHAR(512)  NULL,
    vat             NVARCHAR(64)   NULL,
    email           NVARCHAR(256)  NULL,
    phone           NVARCHAR(128)  NULL,
    city            NVARCHAR(128)  NULL,
    street          NVARCHAR(512)  NULL,
    state_name      NVARCHAR(256)  NULL,
    country_name    NVARCHAR(256)  NULL,
    user_name       NVARCHAR(256)  NULL,
    customer_rank   INT            NULL,
    migrated_at     DATETIME2(3)   NOT NULL CONSTRAINT DF_odoo_partner_migrated DEFAULT SYSUTCDATETIME()
  );
END
