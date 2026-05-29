import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { SkillGate } from "@/lib/sqlGuard";
import { BANDAVONI_ERP_TABLES } from "@/lib/bandavanoniDbCatalog";

const ERP_COMERCIAL = [
  "FAC_FACTURAS",
  "FAC_FACTURA_DETALLE",
  "FAC_CLIENTES",
  "FAC_VEND",
  "FAC_CARTERA",
  "FAC_CIERRE_CAJA",
  "FAC_RETENCIONES_SRI",
] as const;

const ERP_CARTERA = [
  "FAC_CARTERA",
  "FAC_CLIENTES",
  "FAC_FACTURAS",
  "BCO",
  "TES_FLUJO",
  "TES_CAJA",
  "FAC_CIERRE_CAJA",
  "FAC_COMPRAS",
  "FAC_COMPRA",
  "FAC_DET_PAGOS_PROVEEDOR",
  "FAC_CHE_PROVEEDORES",
] as const;

const ERP_INVENTARIO = [
  "FAC_STOCK",
  "FAC_BIEN_SERV",
  "FAC_LOCALES",
  "FAC_MOVIMIENTOS",
] as const;

const ERP_FINANCIEROS = [
  ...ERP_CARTERA,
  ...ERP_INVENTARIO,
  "FAC_RETENCIONES_SRI",
] as const;

export const SKILL_GATE_COMERCIAL: SkillGate = {
  views: [],
  gestionTables: ["META_VENTA_NETA"],
  erpTables: [...ERP_COMERCIAL],
};

export const SKILL_GATE_CARTERA_TESORERIA: SkillGate = {
  views: [],
  erpTables: [...ERP_CARTERA],
};

export const SKILL_GATE_INVENTARIO_COSTOS: SkillGate = {
  views: [],
  gestionTables: ["META_VENTA_NETA"],
  erpTables: [...ERP_INVENTARIO],
};

export const SKILL_GATE_FINANCIEROS: SkillGate = {
  views: [],
  gestionTables: ["META_VENTA_NETA"],
  erpTables: [...ERP_FINANCIEROS],
};

export const BI_SKILL_TOOL_NAMES = [
  "consultar_comercial",
  "consultar_cartera_tesoreria",
  "consultar_inventario_costos",
  "analizar_estados_financieros",
] as const;

export type BiSkillToolName = (typeof BI_SKILL_TOOL_NAMES)[number];

export const BI_SKILL_GATES: Record<BiSkillToolName, SkillGate> = {
  consultar_comercial: SKILL_GATE_COMERCIAL,
  consultar_cartera_tesoreria: SKILL_GATE_CARTERA_TESORERIA,
  consultar_inventario_costos: SKILL_GATE_INVENTARIO_COSTOS,
  analizar_estados_financieros: SKILL_GATE_FINANCIEROS,
};

export const BI_SKILL_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_comercial",
      description: [
        "Ventas e ingresos en bandavanoni_new_2018_resp.",
        "Histórico: dbo.meta_venta_neta WITH (NOLOCK). PERIODO varchar(6) 'YYYYMM'. ANIO/TRIMESTRE/SEMANA disponibles.",
        "Cliente META: RUC, NOMBRE_COMPLETO. FAC_CLIENTES: FCL_RUC, FCL_NOMBRE_COMPLETO (nunca RUC en FAC_CLIENTES).",
        "Sin compras 2025: solo meta_venta_neta HAVING SUM(2025)=0; prohibido SELECT RUC FROM FAC_CLIENTES.",
        "Patrones: trimestre/semana por ANIO; clientes nuevos por PERIODO+RUC; % participación; caída 2024 vs 2025 con CASE WHEN ANIO.",
        "Devoluciones/NC por trimestre y MOVIMIENTO: SUM(VENTA_NETA) ya resta negativos; GROUP BY TRIMESTRE,MOVIMIENTO; no WHERE solo Devolución si piden por tipo documento.",
        "A01/A09 «mes actual»/«del mes»: CAST(PERIODO AS VARCHAR(6))=FORMAT(GETDATE(),'yyyyMM') (calendario hoy). A04 sin período explícito: mismo mes calendario. A05/A06/A07: ANIO=2024 por defecto.",
        "A08: N en fila RESUMEN; muestra hasta SQL_AI_MAX_ROWS filas DETALLE; si exportDataJsonBlock viene en JSON, pégalo tal cual (CSV/Excel completo).",
        "B03: productos margen negativo ANIO=2025 — CTE COUNT+UNION ALL; primera línea = total códigos (19), no filas listadas.",
        "C10: FAC_RETENCIONES_SRI SUM(FRS_VALOR) y COUNT(*), no ventas META.",
        "C04: descuento promedio % sobre ventas WHERE ANIO=2024 (no mes actual).",
        "C12: igual A08 COUNT caída 2024→2025.",
        "Margen: 100*SUM(UTILIDAD)/NULLIF(SUM(VENTA_NETA),0). Producto: CODIGO+DESCRIPCION+CLASIFICACION1.",
        "Hoy: dbo.FAC_FACTURAS WITH (NOLOCK), FFG_ANULADO='N', fecha hoy.",
        "Gestión comercial C: cartera FAC_CARTERA, cierres FAC_CIERRE_CAJA (CICA_*), retenciones FAC_RETENCIONES_SRI.",
        "Prohibido V_MAESTRA_* y [banda]. Una tool_call con CTEs si varias preguntas del mismo dominio.",
        "Si piden 2024 y 2025 (o dos trimestres/años) en la misma frase: un SELECT con ANIO IN (...) o CASE; entregar ambos en la misma respuesta; prohibido dejar el segundo período para después.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Un solo SELECT." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_cartera_tesoreria",
      description: [
        "Cartera, bancos, caja y CxP en bandavanoni_new_2018_resp (solo dbo.*).",
        "Cartera: dbo.FAC_CARTERA — saldo FCC_VALOR-FCC_PAGADO; vencimiento FCC_VEND (NO FECHA_VENCE).",
        "Clientes: JOIN dbo.FAC_CLIENTES. Bancos: dbo.BCO (BCO_SALDO). Caja: dbo.FAC_CIERRE_CAJA.",
        "CxP: dbo.FAC_COMPRAS, dbo.FAC_DET_PAGOS_PROVEEDOR. Tesorería: dbo.TES_FLUJO (puede estar vacía).",
        "Antigüedad cartera: DATEDIFF(day, FCC_VEND, GETDATE()). Prohibido V_MAESTRA_*.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Un solo SELECT." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_inventario_costos",
      description: [
        "Inventario y costos en bandavanoni_new_2018_resp.",
        "Stock: dbo.FAC_STOCK + dbo.FAC_BIEN_SERV + dbo.FAC_LOCALES. STK_ACTUAL, STK_MINIMO, STK_COSTO_ACTUAL.",
        "NO existe META_STOCK_CLASIFICADO. Cruce ventas: JOIN meta_venta_neta.CODIGO = FAC_BIEN_SERV.TBS_CODIGO.",
        "Movimientos: dbo.FAC_MOVIMIENTOS (FMO_TIPO 40 venta, 60 NC). Rotación: ventas agregadas / STK_ACTUAL.",
        "Bodegas en ventas: meta_venta_neta.NOMBRE_BODEGA. Prohibido V_MAESTRA_*.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Un solo SELECT." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_estados_financieros",
      description: [
        "Indicadores y cruces financieros limitados en bandavanoni_new_2018_resp.",
        "Ventas: meta_venta_neta. Cartera/bancos/inventario: tablas FAC_* y BCO.",
        "Sin V_MAESTRA_CONTABILIDAD ni balances formales; si no hay saldos contables, dilo y usa META+FAC_*.",
        "Retenciones: dbo.FAC_RETENCIONES_SRI si aplica.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Un solo SELECT." },
        },
        required: ["sql"],
      },
    },
  },
];
