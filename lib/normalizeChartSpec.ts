import type { CoraChartSpec } from "@/components/CoraChart";
import { chartColorAt } from "@/lib/chartPalette";

const YEAR_LABEL = /^(20\d{2})$/;

function isYearLabel(value: unknown): boolean {
  return YEAR_LABEL.test(String(value ?? "").trim());
}

/** Una sola serie y el eje X son años → varias series (2024, 2025…) con leyenda correcta. */
function pivotYearsOnAxis(spec: CoraChartSpec): CoraChartSpec | null {
  if (spec.series.length !== 1 || spec.data.length < 2 || spec.data.length > 12) return null;

  const labels = spec.data.map((r) => String(r[spec.xKey] ?? "").trim());
  if (!labels.every(isYearLabel)) return null;

  const valueKey = spec.series[0]!.key;
  const periodName =
    labels.length === 2 ? "Comparación" : String(spec.data[0]?.[spec.xKey] ?? "Período");

  const row: Record<string, unknown> = { _coraPeriod: periodName };
  const series: CoraChartSpec["series"] = [];

  spec.data.forEach((r, i) => {
    const year = String(r[spec.xKey]).trim();
    const key = `y${year}`;
    const v = Number(r[valueKey]);
    if (!Number.isFinite(v)) return;
    row[key] = v;
    series.push({
      key,
      name: year,
      color: chartColorAt(i),
    });
  });

  if (series.length < 2) return null;

  return {
    ...spec,
    xKey: "_coraPeriod",
    series,
    data: [row],
  };
}

/**
 * Para vista Líneas con comparativa de pocos puntos: dos (o más) líneas horizontales por nivel de cada año/serie.
 */
export function expandComparisonLinesData(spec: CoraChartSpec): CoraChartSpec["data"] {
  if (spec.series.length < 2) return spec.data;

  const xLabels =
    spec.data.length === 1
      ? spec.series.map((s) => s.name)
      : spec.data.map((r) => String(r[spec.xKey] ?? "").trim()).filter(Boolean);

  if (xLabels.length < 2) return spec.data;

  const baseRow =
    spec.data.length === 1
      ? spec.data[0]
      : spec.data.reduce<Record<string, unknown>>((acc, r) => ({ ...acc, ...r }), {});

  if (!baseRow) return spec.data;

  return xLabels.map((label) => {
    const point: Record<string, unknown> = { [spec.xKey]: label };
    for (const s of spec.series) {
      const v = Number(baseRow[s.key]);
      point[s.key] = Number.isFinite(v) ? v : null;
    }
    return point;
  });
}

/** Prepara el spec para gráficos comparativos (leyenda 2024/2025, colores, etc.). */
export function normalizeChartSpec(spec: CoraChartSpec): CoraChartSpec {
  return pivotYearsOnAxis(spec) ?? spec;
}

export function isComparisonChart(spec: CoraChartSpec): boolean {
  return spec.series.length >= 2;
}

export function canShowComparisonLines(spec: CoraChartSpec): boolean {
  if (spec.series.length < 2) return false;
  if (spec.data.length >= 4) return true;
  if (spec.data.length === 1) return true;
  return spec.data.length >= 2;
}
