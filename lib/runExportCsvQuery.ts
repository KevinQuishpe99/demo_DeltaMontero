import type { BiSkillToolName } from "@/lib/biSkillTools";
import {
  runExportRowsQuery,
  type RunExportRowsOptions,
} from "@/lib/runExportRowsQuery";

function rowToCsvLine(
  keys: string[],
  row: Record<string, unknown>
): string {
  return keys
    .map((k) => {
      const v = row[k];
      const s = v == null ? "" : String(v);
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

export type RunExportCsvOptions = RunExportRowsOptions;

export async function runExportCsvQuery(
  skill: BiSkillToolName,
  sql: string,
  options: RunExportCsvOptions = {}
): Promise<{
  csv: string;
  rowCount: number;
  truncated: boolean;
  chunks: number;
}> {
  const { rows, rowCount, truncated, chunks } = await runExportRowsQuery(
    skill,
    sql,
    options
  );
  if (!rows.length) {
    return { csv: "", rowCount: 0, truncated: false, chunks };
  }
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(","),
    ...rows.map((r) => rowToCsvLine(keys, r)),
  ];
  return {
    csv: lines.join("\r\n"),
    rowCount,
    truncated,
    chunks,
  };
}
