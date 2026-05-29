"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import {
  BarChart3,
  LayoutList,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import { chartColorAt, CHART_PALETTE } from "@/lib/chartPalette";
import {
  expandComparisonLinesData,
  isComparisonChart,
  normalizeChartSpec,
} from "@/lib/normalizeChartSpec";
import {
  pickTop3ChartViews,
  type ChartViewMode,
} from "@/lib/chartViewStrategy";

export type CoraChartSpec = {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  data: Record<string, unknown>[];
  xKey: string;
  series: { key: string; name: string; color?: string }[];
};

const VIEW_META: Record<
  ChartViewMode,
  { label: string; Icon: typeof BarChart3 }
> = {
  bar: { label: "Barras", Icon: BarChart3 },
  line: { label: "Líneas", Icon: LineChartIcon },
  horizontal: { label: "Comparar", Icon: LayoutList },
  area: { label: "Tendencia", Icon: TrendingUp },
  pie: { label: "Pastel", Icon: PieChartIcon },
};

function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toLocaleString("es-EC", { maximumFractionDigits: 0 });
}

function formatTooltipValue(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "");
  return value.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[10rem] rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-lg shadow-slate-200/60 backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label ?? ""}
      </p>
      <ul className="space-y-1">
        {payload
          .filter((e) => e.value != null && e.value !== "")
          .map((entry) => (
            <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color ?? "#64748b" }}
                />
                {entry.name}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatTooltipValue(entry.value)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function flattenForPie(spec: CoraChartSpec): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  for (const row of spec.data) {
    const x = String(row[spec.xKey] ?? "").trim() || "—";
    if (spec.series.length === 1) {
      const v = Number(row[spec.series[0]!.key]);
      if (Number.isFinite(v)) out.push({ name: x, value: v });
    } else {
      for (const s of spec.series) {
        const v = Number(row[s.key]);
        if (Number.isFinite(v)) out.push({ name: s.name, value: v });
      }
    }
  }
  return out;
}

export function CoraChart({ spec: rawSpec }: { spec: CoraChartSpec }) {
  const spec = useMemo(() => normalizeChartSpec(rawSpec), [rawSpec]);
  const pieSlices = useMemo(() => flattenForPie(spec), [spec]);
  const canPie = pieSlices.length >= 2 && pieSlices.length <= 16;
  const compare = isComparisonChart(spec);

  const plan = useMemo(() => pickTop3ChartViews(spec, canPie), [spec, canPie]);

  const [view, setView] = useState<ChartViewMode>(plan.defaultView);

  const activeView = plan.views.includes(view) ? view : plan.defaultView;

  const seriesColors = useMemo(
    () => spec.series.map((s, i) => s.color ?? chartColorAt(i)),
    [spec.series],
  );

  const chartDataForView = useMemo(() => {
    if (activeView === "line" && spec.series.length >= 2) {
      if (spec.data.length === 1 || spec.data.length <= 4) {
        return expandComparisonLinesData(spec);
      }
    }
    return spec.data;
  }, [activeView, spec]);

  const legend = (
    <Legend
      verticalAlign="bottom"
      height={40}
      iconType="circle"
      iconSize={8}
      wrapperStyle={{ fontSize: 12, color: "#475569", paddingTop: 8 }}
    />
  );

  const cartesianVertical = () => (
    <>
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
      <XAxis
        dataKey={spec.xKey}
        tick={{ fill: "#64748b", fontSize: 12 }}
        axisLine={{ stroke: "#cbd5e1" }}
        tickLine={false}
        dy={6}
      />
      <YAxis
        tick={{ fill: "#64748b", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => (typeof v === "number" ? formatAxisValue(v) : "")}
        width={56}
      />
      <Tooltip content={<ChartTooltip />} />
      {legend}
    </>
  );

  const renderSeriesBars = (singleSeriesCells: boolean) =>
    spec.series.map((s, seriesIdx) => {
      const color = seriesColors[seriesIdx] ?? chartColorAt(seriesIdx);
      return (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.name}
          fill={color}
          radius={[6, 6, 0, 0]}
          maxBarSize={compare && spec.data.length === 1 ? 64 : 52}
          animationDuration={500}
        >
          {singleSeriesCells
            ? spec.data.map((_, i) => <Cell key={`v-${i}`} fill={chartColorAt(i)} />)
            : null}
        </Bar>
      );
    });

  const renderVerticalBars = () => (
    <BarChart
      data={spec.data}
      margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
      barCategoryGap={compare ? "28%" : "18%"}
      barGap={compare ? 10 : 6}
    >
      {cartesianVertical()}
      {renderSeriesBars(spec.series.length === 1)}
    </BarChart>
  );

  const renderHorizontalBars = () => {
    const yWidth = Math.min(
      128,
      Math.max(64, ...spec.data.map((r) => String(r[spec.xKey] ?? "").length * 8)),
    );
    return (
      <BarChart
        layout="vertical"
        data={spec.data}
        margin={{ top: 12, right: 24, left: 8, bottom: 8 }}
        barCategoryGap="24%"
      >
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (typeof v === "number" ? formatAxisValue(v) : "")}
        />
        <YAxis
          type="category"
          dataKey={spec.xKey}
          width={yWidth}
          tick={{ fill: "#475569", fontSize: 12, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(5, 150, 105, 0.08)" }} />
        {legend}
        {renderSeriesBars(spec.series.length === 1)}
      </BarChart>
    );
  };

  const renderLines = () => (
    <LineChart data={chartDataForView} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
      {cartesianVertical()}
      {spec.series.map((s, seriesIdx) => {
        const color = seriesColors[seriesIdx] ?? chartColorAt(seriesIdx);
        return (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={color}
            strokeWidth={3}
            dot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
            animationDuration={500}
          />
        );
      })}
    </LineChart>
  );

  const renderAreaTrend = () => (
    <AreaChart data={spec.data} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
      <defs>
        {spec.series.map((s, i) => {
          const color = seriesColors[i] ?? chartColorAt(i);
          return (
            <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          );
        })}
      </defs>
      {cartesianVertical()}
      {spec.series.map((s, seriesIdx) => {
        const color = seriesColors[seriesIdx] ?? chartColorAt(seriesIdx);
        return (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#area-${s.key})`}
            dot={{ r: 4, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            animationDuration={500}
          />
        );
      })}
    </AreaChart>
  );

  const renderPie = () => (
    <PieChart>
      <Pie
        data={pieSlices}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="46%"
        innerRadius={52}
        outerRadius={96}
        paddingAngle={2}
        animationDuration={500}
        label={({ name, percent }) =>
          (percent ?? 0) >= 0.06 ? `${name}: ${((percent ?? 0) * 100).toFixed(0)}%` : ""
        }
        labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
      >
        {pieSlices.map((_, i) => (
          <Cell
            key={`pie-${i}`}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
      </Pie>
      <Tooltip content={<ChartTooltip />} />
      {legend}
    </PieChart>
  );

  const renderChart = () => {
    switch (activeView) {
      case "line":
        return renderLines();
      case "horizontal":
        return renderHorizontalBars();
      case "area":
        return renderAreaTrend();
      case "pie":
        return renderPie();
      default:
        return renderVerticalBars();
    }
  };

  return (
    <div className="my-5 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-md shadow-slate-200/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700/90">
            Visualización · CORA
          </p>
          <p className="text-xs font-medium text-slate-700">{plan.profileLabel}</p>
          <p className="text-xs text-slate-500">{plan.subtitles[activeView]}</p>
        </div>
        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5 shadow-inner"
          role="tablist"
          aria-label="Tres mejores vistas del gráfico"
        >
          {plan.views.map((id, idx) => {
            const { label, Icon } = VIEW_META[id];
            const on = activeView === id;
            const recommended = idx === 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                title={plan.subtitles[id]}
                onClick={() => setView(id)}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  on
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                {recommended && on ? (
                  <span className="absolute -top-2 -right-1 rounded-full bg-emerald-600 px-1.5 py-px text-[9px] font-bold text-white">
                    ★
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-[22rem] w-full px-2 pb-3 pt-1 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">{renderChart()}</ResponsiveContainer>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-center text-[10px] text-slate-400">
        {VIEW_META[activeView].label}
        {compare && spec.series.length >= 2
          ? ` · ${spec.series.map((s) => s.name).join(" vs ")}`
          : ""}
        {" · "}
        3 vistas recomendadas por CORA
      </p>
    </div>
  );
}
