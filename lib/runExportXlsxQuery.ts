import ExcelJS from "exceljs";
import type { BiSkillToolName } from "@/lib/biSkillTools";
import {
  runExportRowsQuery,
  type RunExportRowsOptions,
} from "@/lib/runExportRowsQuery";

export type RunExportXlsxOptions = RunExportRowsOptions;

function cellValue(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

export async function runExportXlsxQuery(
  skill: BiSkillToolName,
  sql: string,
  options: RunExportXlsxOptions = {}
): Promise<{
  buffer: Buffer;
  rowCount: number;
  truncated: boolean;
  chunks: number;
}> {
  const { rows, rowCount, truncated, chunks } = await runExportRowsQuery(
    skill,
    sql,
    options
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "CORA IA";
  const ws = wb.addWorksheet("Datos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  if (!rows.length) {
    const buf = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buf),
      rowCount: 0,
      truncated: false,
      chunks,
    };
  }

  const keys = Object.keys(rows[0]);
  ws.addRow(keys);
  for (const r of rows) {
    ws.addRow(keys.map((k) => cellValue(r[k])));
  }
  ws.getRow(1).font = { bold: true };
  keys.forEach((k, i) => {
    ws.getColumn(i + 1).width = Math.min(42, Math.max(12, k.length + 2));
  });

  const buf = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buf),
    rowCount,
    truncated,
    chunks,
  };
}
