import { buildSeriesForRange } from "@/lib/dashboardSeries";

export type DailySeriesBuildInput = Parameters<typeof buildSeriesForRange>[0];
export type DailySeriesBuildOutput = ReturnType<typeof buildSeriesForRange>;

export function buildDailyKpiSeries(input: DailySeriesBuildInput): DailySeriesBuildOutput {
  return buildSeriesForRange(input);
}
