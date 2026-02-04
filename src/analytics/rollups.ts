export type AnalyticsDateRange = {
  start: Date;
  end: Date;
};

export type DailyKpiPoint = {
  dateKey: string;
  revenue: number;
  orders: number;
  cogs: number;
  adSpend: number;
  profit: number;
  margin: number;
  roas: number;
};

export type StoreRollupSnapshot = {
  shopId: string;
  range: AnalyticsDateRange;
  points: DailyKpiPoint[];
};

export type RollupQuery = {
  shopId: string;
  range: AnalyticsDateRange;
};

export interface RollupStore {
  getDailyStoreRollup(query: RollupQuery): Promise<StoreRollupSnapshot | null>;
}

/**
 * Placeholder registry for future materialized views.
 * Structure only: no runtime behavior change.
 */
export const ANALYTICS_MATERIALIZED_VIEWS = {
  dailyStoreKpis: "mv_daily_store_kpis",
} as const;

export function createNoopRollupStore(): RollupStore {
  return {
    async getDailyStoreRollup() {
      return null;
    },
  };
}
