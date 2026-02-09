"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DropdownSelect } from "./DropdownSelect";

export type KpiKey = "revenue" | "orders" | "cogs" | "adSpend" | "profit" | "margin" | "roas";

type KpiOption = {
  key: KpiKey;
  label: string;
  format: "currency" | "number" | "percent" | "ratio";
};

type KpiSeries = Record<KpiKey, number[]>;

type StoreSeries = {
  shopId: string;
  label: string;
  valuesByKpi: KpiSeries;
};

type Props = {
  dateKeys: string[];
  kpiOptions: KpiOption[];
  aggregateSeries: KpiSeries;
  comparisonSeries?: KpiSeries;
  comparisonDateKeys?: string[];
  comparisonLabel?: string;
  storeSeries: StoreSeries[];
  defaultSelected: KpiKey[];
  defaultCompare: KpiKey;
};

const COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatValue(format: KpiOption["format"], value: number) {
  if (format === "currency") return currencyFormatter.format(value);
  if (format === "percent") return percentFormatter.format(value);
  if (format === "ratio") return `${numberFormatter.format(value)}x`;
  return numberFormatter.format(value);
}

function buildTicks(min: number, max: number, count: number) {
  if (max <= min) return Array.from({ length: count }, () => min);
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, idx) => min + step * idx);
}

function aggregateValues(values: number[], format: KpiOption["format"]) {
  if (!values.length) return 0;
  if (format === "percent" || format === "ratio") {
    const sum = values.reduce((total, value) => total + value, 0);
    return sum / values.length;
  }
  return values.reduce((total, value) => total + value, 0);
}

type LineSeries = {
  id: string;
  label: string;
  color: string;
  values: number[];
};

type Granularity = "daily" | "hourly";

function getISOWeek(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getISOWeekYear(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  return temp.getUTCFullYear();
}

function transformSeries({
  dateKeys,
  values,
  granularity,
  format,
}: {
  dateKeys: string[];
  values: number[];
  granularity: Granularity;
  format: KpiOption["format"];
}) {
  return { labels: dateKeys, values };
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const tension = 0.2;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function LineChart({
  dateKeys,
  series,
  format,
  compact = false,
  compactHeight,
  granularity,
  comparisonValues,
  fixedHeight,
}: {
  dateKeys: string[];
  series: LineSeries[];
  format: KpiOption["format"];
  compact?: boolean;
  compactHeight?: number;
  granularity: Granularity;
  comparisonValues?: number[];
  fixedHeight?: number;
}) {
  const chartId = useId();
  const clipId = `${chartId}-clip`;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(680);
  const width = containerWidth;
  const height = compact ? (compactHeight ?? 220) : 380;
  const padding = compact
    ? { top: 14, right: 14, bottom: 28, left: 56 }
    : { top: 16, right: 18, bottom: 32, left: 64 };

  const points = useMemo(() => {
    const values = series.flatMap((item) => item.values);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const xStep = dateKeys.length > 1 ? innerWidth / (dateKeys.length - 1) : 0;
    const toX = (idx: number) => padding.left + idx * xStep;
    const toY = (value: number) =>
      padding.top + innerHeight - ((value - min) / range) * innerHeight;

    return {
      min,
      max,
      range,
      toX,
      toY,
      innerWidth,
      innerHeight,
    };
  }, [dateKeys.length, series, padding.left, padding.right, padding.top, padding.bottom]);

  const ticks = buildTicks(points.min, points.max, compact ? 3 : 4);
  const shortDate = (value: string) =>
    new Date(value).toLocaleDateString("nl-NL", { month: "short", day: "numeric" });
  const hourLabel = (value: string) =>
    new Date(value).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const tooltipLabel = (value: string) => {
    if (granularity === "hourly") {
      return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(value),
      );
    }
    return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  };

  const hoverX = hoverIndex !== null ? points.toX(hoverIndex) : null;
  const primaryValue = hoverIndex !== null ? series[0]?.values[hoverIndex] ?? null : null;
  const compareValue =
    hoverIndex !== null && comparisonValues ? comparisonValues[hoverIndex] ?? null : null;
  const tooltipWidth = 190;
  const tooltipX =
    hoverX !== null && hoverX + tooltipWidth + 18 > width - padding.right
      ? hoverX - tooltipWidth - 12
      : hoverX !== null
        ? hoverX + 10
        : 0;
  const tooltipHeight = compareValue !== null ? 74 : 48;

  const formatAxisValue = (value: number) => {
    if (format === "currency") {
      return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
        notation: "compact",
        compactDisplay: "short",
      }).format(value);
    }
    if (format === "percent") return percentFormatter.format(value);
    if (format === "ratio") return `${numberFormatter.format(value)}x`;
    return new Intl.NumberFormat("nl-NL", {
      maximumFractionDigits: 0,
      notation: "compact",
      compactDisplay: "short",
    }).format(value);
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.max(320, Math.round(entry.contentRect.width));
      setContainerWidth(nextWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full"
        style={fixedHeight ? { height: fixedHeight } : undefined}
      >
      {compact && series.length === 1 ? (
        <defs>
          <linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0].color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}
      <defs>
        <clipPath id={clipId}>
          <rect
            x={padding.left}
            y={padding.top}
            width={points.innerWidth}
            height={points.innerHeight}
            rx="10"
            ry="10"
          />
        </clipPath>
      </defs>
      <rect
        x={padding.left}
        y={padding.top}
        width={points.innerWidth}
        height={points.innerHeight}
        fill="transparent"
        stroke="rgba(17,18,22,0.08)"
        strokeWidth="1"
      />

      {ticks.map((tick, idx) => {
        const y = points.toY(tick);
        return (
          <g key={`${tick}-${idx}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(17,18,22,0.08)"
              strokeDasharray="3 6"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              fontSize="11"
              fill="rgba(17,18,22,0.65)"
              textAnchor="end"
            >
              {formatAxisValue(tick)}
            </text>
          </g>
        );
      })}

      <>
        {dateKeys.length > 1 ? (() => {
          const labelStep = Math.max(1, Math.ceil(dateKeys.length / 4));
          return dateKeys.map((label, idx) => {
            const isEdge = idx === 0 || idx === dateKeys.length - 1;
            const isStep = idx % labelStep === 0;
            if (!isEdge && !isStep) return null;
            return (
              <text
                key={`${label}-${idx}`}
                x={points.toX(idx)}
                y={height - 8}
                fontSize="11"
                fill="rgba(17,18,22,0.6)"
                textAnchor={idx === 0 ? "start" : idx === dateKeys.length - 1 ? "end" : "middle"}
              >
                {granularity === "hourly" ? hourLabel(label) : shortDate(label)}
              </text>
            );
          });
        })() : null}
      </>

      <g clipPath={`url(#${clipId})`}>
        {series.map((line) => {
        const coords = line.values.map((value, idx) => ({
          x: points.toX(idx),
          y: points.toY(value),
        }));
        const path = buildSmoothPath(coords);
        return (
          <g key={line.id}>
            <path
              d={path}
              fill="none"
              stroke={line.color}
              strokeWidth={compact ? "1.6" : "2"}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
        })}

        {comparisonValues && comparisonValues.length === dateKeys.length ? (
          <path
            d={buildSmoothPath(
              comparisonValues.map((value, idx) => ({
                x: points.toX(idx),
                y: points.toY(value),
              })),
            )}
            fill="none"
            stroke="rgba(17,18,22,0.28)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
        ) : null}

        {series.map((line) => {
        const lastIndex = line.values.length - 1;
        if (lastIndex < 0) return null;
        const x = points.toX(lastIndex);
        const y = points.toY(line.values[lastIndex]);
        return (
          <g key={`${line.id}-dot`}>
            <circle cx={x} cy={y} r="4" fill="white" />
            <circle cx={x} cy={y} r="3" fill={line.color} />
          </g>
        );
        })}
      </g>

      {hoverX !== null ? (
        <g>
          <line
            x1={hoverX}
            x2={hoverX}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="rgba(17,18,22,0.2)"
            strokeDasharray="3 6"
            clipPath={`url(#${clipId})`}
          />
          {primaryValue !== null ? (
            <>
              <circle cx={hoverX} cy={points.toY(primaryValue)} r="4" fill="white" />
              <circle cx={hoverX} cy={points.toY(primaryValue)} r="3" fill={series[0].color} />
            </>
          ) : null}
          {compareValue !== null ? (
            <>
              <circle cx={hoverX} cy={points.toY(compareValue)} r="3.5" fill="white" />
              <circle cx={hoverX} cy={points.toY(compareValue)} r="2.5" fill="rgba(17,18,22,0.45)" />
            </>
          ) : null}
          {hoverIndex !== null && primaryValue !== null ? (
            <g>
              <rect
                x={tooltipX}
                y={padding.top + 6}
                rx="10"
                ry="10"
                width={tooltipWidth}
                height={tooltipHeight}
                fill="rgba(255,255,255,0.95)"
                stroke="rgba(17,18,22,0.08)"
              />
              <text x={tooltipX + 12} y={padding.top + 24} fontSize="11" fill="rgba(17,18,22,0.7)">
                {tooltipLabel(dateKeys[hoverIndex] ?? "")}
              </text>
              <text x={tooltipX + 12} y={padding.top + 42} fontSize="12" fontWeight="600" fill="rgba(17,18,22,0.9)">
                {formatValue(format, primaryValue)}
              </text>
              {compareValue !== null ? (
                <text x={tooltipX + 12} y={padding.top + 58} fontSize="11" fill="rgba(17,18,22,0.6)">
                  Prev {formatValue(format, compareValue)}
                </text>
              ) : null}
              {hoverIndex > 0 ? (() => {
                const prev = series[0]?.values[hoverIndex - 1] ?? null;
                const base = compareValue ?? prev;
                if (base === null || base === 0) {
                  return (
                    <text x={tooltipX + 12} y={padding.top + 72} fontSize="11" fill="rgba(17,18,22,0.6)">
                      Δ —
                    </text>
                  );
                }
                const delta = (primaryValue - base) / Math.abs(base);
                return (
                  <text x={tooltipX + 12} y={padding.top + 72} fontSize="11" fill="rgba(17,18,22,0.6)">
                    Δ {percentFormatter.format(delta)}
                  </text>
                );
              })() : null}
            </g>
          ) : null}
        </g>
      ) : null}

      <rect
        x={padding.left}
        y={padding.top}
        width={points.innerWidth}
        height={points.innerHeight}
        fill="transparent"
        onMouseMove={(event) => {
          const target = event.currentTarget;
          const rect = target.getBoundingClientRect();
          const scale = width / rect.width;
          const x = (event.clientX - rect.left) * scale;
          const clamped = Math.max(padding.left, Math.min(x, width - padding.right));
          const xStep = dateKeys.length > 1 ? points.innerWidth / (dateKeys.length - 1) : 0;
          const index = xStep ? Math.round((clamped - padding.left) / xStep) : 0;
          setHoverIndex(index);
        }}
        onMouseLeave={() => setHoverIndex(null)}
      />
      </svg>
    </div>
  );
}

export function KpiTwoPanelChart({
  dateKeys,
  kpiOptions,
  aggregateSeries,
  comparisonSeries,
  comparisonDateKeys,
  comparisonLabel,
  storeSeries,
  defaultSelected,
  defaultCompare,
}: Props) {
  const [selectedKpis] = useState<KpiKey[]>(defaultSelected);
  const [compareKpi, setCompareKpi] = useState<KpiKey>(defaultCompare);
  const granularity: Granularity =
    dateKeys.length === 24 && dateKeys[0]?.includes("T") ? "hourly" : "daily";

  const selectedOptions = kpiOptions.filter((option) => selectedKpis.includes(option.key));
  const compareOption = kpiOptions.find((option) => option.key === compareKpi) ?? kpiOptions[0];

  const aggregateLines = selectedOptions.map((option, idx) => ({
    id: option.key,
    label: option.label,
    color: COLORS[idx % COLORS.length],
    values: aggregateSeries[option.key],
    format: option.format,
  }));

  const storeLines = storeSeries.map((store, idx) => ({
    id: store.shopId,
    label: store.label,
    color: COLORS[idx % COLORS.length],
    values: store.valuesByKpi[compareKpi],
  }));

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {aggregateLines.map((line) => {
          const transformed = transformSeries({
            dateKeys,
            values: line.values,
            granularity,
            format: line.format,
          });
          const compareValuesRaw = comparisonSeries?.[line.id] ?? [];
          const compareKeys = comparisonDateKeys ?? dateKeys;
          const compareTransformed = transformSeries({
            dateKeys: compareKeys,
            values: compareValuesRaw,
            granularity,
            format: line.format,
          });
          const currentTotal = aggregateValues(transformed.values, line.format);
          const previousTotal = aggregateValues(compareTransformed.values, line.format);
          const deltaPct =
            compareTransformed.values.length === 0 || previousTotal === 0
              ? null
              : (currentTotal - previousTotal) / Math.abs(previousTotal);
          const deltaLabel =
            deltaPct === null
              ? "—"
              : `${deltaPct >= 0 ? "+" : ""}${percentFormatter.format(deltaPct)}`;
          const deltaTone = deltaPct === null ? "text-[color:var(--pp-muted)]" : deltaPct >= 0 ? "text-emerald-600" : "text-rose-600";
          const cardSpan =
            line.id === "profit" ? "lg:col-span-2" : "lg:col-span-1";
          return (
          <section
            key={line.id}
            className={`pp-card glass-surface w-full min-w-0 p-4 ${cardSpan}`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[color:var(--pp-foreground)]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
                  <span className="truncate">{line.label}</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--pp-muted)]">
                  Based on selected date range
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <div className="text-2xl font-semibold text-[color:var(--pp-foreground)]">
                    {formatValue(line.format, currentTotal)}
                  </div>
                  <div className="text-xs text-[color:var(--pp-muted)]">
                    {comparisonLabel && comparisonLabel.trim().length > 0 ? comparisonLabel : "vs previous period"}
                  </div>
                </div>
              </div>
              <div className={`rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-xs font-semibold ${deltaTone}`}>
                {deltaLabel}
              </div>
            </div>
            <div className="mt-3 flex w-full items-center justify-end text-xs text-[color:var(--pp-muted)]">
              {granularity === "hourly" ? "Hourly" : "Daily"}
            </div>
            <div className="mt-3 min-w-0 rounded-2xl border border-[color:var(--pp-border)] bg-white/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              {transformed.values.every((value) => value === 0) ? (
                <div className="flex h-52 items-center justify-center text-sm text-[color:var(--pp-muted)]">
                  No data in selected period.
                </div>
              ) : (
                <LineChart
                  dateKeys={transformed.labels}
                  series={[{ ...line, values: transformed.values }]}
                  format={line.format}
                  granularity={granularity}
                  compact
                  compactHeight={
                    line.id === "profit" ? 240 : line.id === "revenue" || line.id === "adSpend" ? 220 : 200
                  }
                  fixedHeight={
                    line.id === "profit" ? 240 : line.id === "revenue" || line.id === "adSpend" ? 220 : 200
                  }
                  comparisonValues={compareTransformed.values}
                />
              )}
            </div>
          </section>
        )})}
      </div>

      {storeSeries.length > 1 ? (
        <section className="pp-card glass-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Store comparison</p>
              <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Compare stores by KPI</h3>
            </div>
            <DropdownSelect
              value={compareKpi}
              options={kpiOptions.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
              onChange={(value) => setCompareKpi(value as KpiKey)}
              className="w-full sm:w-auto"
              menuClassName="w-56"
              buttonLabel="Select KPI"
            />
          </div>
          <div className="mt-4 rounded-2xl border border-[color:var(--pp-border)] bg-white/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <LineChart dateKeys={dateKeys} series={storeLines} format={compareOption.format} granularity={granularity} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-[color:var(--pp-muted)]">
            {storeLines.map((line) => (
              <div key={line.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                {line.label}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
