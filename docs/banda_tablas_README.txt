Inventario de tablas en banda.dbo
==================================

1) Listado en el repo
   - docs/banda_tablas_inventario.txt se puede generar a partir de un volcado TSV
     (columnas: banda, dbo, NombreTabla, fecha_modificacion) guardado como:
     docs/banda_tablas_export_raw.tsv

   - Comando: npm run banda:inventory

2) El agente CORA / DELTAMONTERO no puede consultar todas estas tablas: solo las que
   estén permitidas en lib/sqlGuard.ts (BANDA_KNOWN_TABLES y gates por skill en
   lib/biSkillTools.ts). Este inventario es referencia para humanos y para prompts,
   no es lista de autorización SQL.

3) Alternativa en SQL Server (nombres actuales):

   SELECT s.name AS esquema, t.name AS tabla
   FROM banda.sys.tables t
   INNER JOIN banda.sys.schemas s ON t.schema_id = s.schema_id
   WHERE s.name = N'dbo'
   ORDER BY t.name;
