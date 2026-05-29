import type { CoraChartSpec } from "@/components/CoraChart";

export type ChartViewMode = "bar" | "line" | "horizontal" | "area" | "pie";

const MONTH_NAMES =
  /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i;

export function isTimeSeriesLike(spec: CoraChartSpec): boolean {
  if (spec.data.length < 4) return false;
  const labels = spec.data.map((d) => String(d[spec.xKey] ?? "").trim());
  if (labels.every((s) => /^\d{6}$/.test(s))) return true;
  if (labels.every((s) => /^\d{4}-\d{2}$/.test(s) || /^\d{4}\/\d{2}$/.test(s))) return true;
  if (labels.filter((s) => MONTH_NAMES.test(s)).length >= labels.length * 0.6) return true;
  const numeric = labels.filter((s) => /^\d{1,2}$/.test(s));
  return numeric.length >= 4 && numeric.length === labels.length;
}

export type ChartViewPlan = {
  /** Exactamente 3 vistas, ordenadas de mejor a peor para estos datos. */
  views: [ChartViewMode, ChartViewMode, ChartViewMode];
  defaultView: ChartViewMode;
  profileLabel: string;
  subtitles: Record<ChartViewMode, string>;
};

function uniqueThree(candidates: ChartViewMode[]): [ChartViewMode, ChartViewMode, ChartViewMode] {
  const seen = new Set<ChartViewMode>();
  const out: ChartViewMode[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  const fallback: ChartViewMode[] = ["bar", "horizontal", "line", "area", "pie"];
  for (const f of fallback) {
    if (out.length >= 3) break;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return [out[0]!, out[1]!, out[2]!];
}

/**
 * Elige las 3 mejores formas de ver estos datos (CORA decide, no el usuario a ciegas).
 */
export function pickTop3ChartViews(spec: CoraChartSpec, canPie: boolean): ChartViewPlan {
  const trend = isTimeSeriesLike(spec);
  const multiSeries = spec.series.length >= 2;
  const n = spec.data.length;
  const shortCompare = multiSeries && n <= 4;

  const subtitles: Record<ChartViewMode, string> = {
    bar: "Valores uno al lado del otro — ideal para comparar",
    horizontal: "Lectura fácil de mayor a menor",
    line: "Una línea por año o serie",
    area: "Cómo sube o baja mes a mes",
    pie: "Qué parte representa cada uno del total",
  };

  if (trend && multiSeries) {
    const views = uniqueThree(["area", "line", "bar"]);
    return {
      views,
      defaultView: views[0],
      profileLabel: "Evolución en el tiempo",
      subtitles,
    };
  }

  if (trend) {
    const views = uniqueThree(["area", "bar", "line"]);
    return {
      views,
      defaultView: views[0],
      profileLabel: "Tendencia mensual",
      subtitles,
    };
  }

  if (shortCompare) {
    const views = uniqueThree(["bar", "horizontal", canPie ? "pie" : "line"]);
    return {
      views,
      defaultView: "bar",
      profileLabel: "Comparativa directa",
      subtitles: {
        ...subtitles,
        bar: "Mejor para ver 2024 vs 2025 de un vistazo",
        horizontal: "Compara montos en filas claras",
        line: "Cada año con su propia línea de color",
        pie: "Porcentaje de participación de cada año",
        area: subtitles.area,
      },
    };
  }

  if (canPie && n <= 8 && !multiSeries) {
    const views = uniqueThree(["bar", "pie", "horizontal"]);
    return {
      views,
      defaultView: "bar",
      profileLabel: "Distribución por categoría",
      subtitles,
    };
  }

  if (canPie) {
    const views = uniqueThree(["bar", multiSeries ? "line" : "horizontal", "pie"]);
    return {
      views,
      defaultView: "bar",
      profileLabel: "Ranking y participación",
      subtitles,
    };
  }

  const views = uniqueThree([
    "bar",
    multiSeries ? "line" : "horizontal",
    multiSeries ? "horizontal" : "line",
  ]);
  return {
    views,
    defaultView: "bar",
    profileLabel: "Comparación de valores",
    subtitles,
  };
}
