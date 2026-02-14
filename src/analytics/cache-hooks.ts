import type { AnalyticsDateRange } from "./rollups";

export type AnalyticsCacheKeyInput = {
  shopId: string | null;
  range: AnalyticsDateRange;
};

export function buildDailySeriesCacheKey(input: AnalyticsCacheKeyInput) {
  const shopKey = input.shopId ?? "portfolio";
  const start = input.range.start.toISOString().slice(0, 10);
  const end = input.range.end.toISOString().slice(0, 10);
  return `analytics:daily-series:${shopKey}:${start}:${end}`;
}

export function getRangeDayCount(range: AnalyticsDateRange) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export function shouldUseRollups(range: AnalyticsDateRange, thresholdDays = 31) {
  return getRangeDayCount(range) >= thresholdDays;
}
