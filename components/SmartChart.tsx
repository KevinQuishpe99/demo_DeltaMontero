"use client";

import { CoraChart } from "@/components/CoraChart";

export type SmartChartSpec = {
  type: "smartChart";
  xKey: string;
  series: { key: string; name: string; color?: string }[];
  data: Record<string, unknown>[];
};

function looksLikeTimeSeries(
  data: Record<string, unknown>[],
  xKey: string,
): boolean {
  if (data.length < 2) return false;
  const vals = data
    .map((d) => String(d[xKey] ?? ""))
    .filter((s) => s.length > 0);
  if (vals.length < 2) return false;
  if (vals.every((s) => /^\d{6}$/.test(s))) return true;
  if (vals.every((s) => /^\d{4}-\d{2}$/.test(s) || /^\d{4}\/\d{2}$/.test(s))) return true;
  const numeric = vals.filter((s) => /^\d+$/.test(s));
  return numeric.length === vals.length && vals.length >= 3;
}

export function SmartChart({ spec }: { spec: SmartChartSpec }) {
  const chartType = looksLikeTimeSeries(spec.data, spec.xKey) ? "line" : "bar";
  return (
    <CoraChart
      spec={{
        type: "chart",
        chartType,
        xKey: spec.xKey,
        series: spec.series,
        data: spec.data,
      }}
    />
  );
}
