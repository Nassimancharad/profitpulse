import type { OrderProfitResult } from "@/domain/profit-engine/order-profit";
import {
  addDaysToDateKey,
  dayBoundsForDateKey,
  normalizeShopTimezone,
  parseDateKey,
  toTimeZoneDateKey,
} from "@/lib/timezone";

type OrderProfitQueryInput = {
  shop: string | null;
  start: string | null;
  end: string | null;
  timezone?: string | null;
  now?: Date;
};

type OrderProfitQuerySuccess = {
  ok: true;
  query: {
    shopDomain: string;
    startDateKey: string;
    endDateKey: string;
    startDate: Date;
    endDate: Date;
  };
};

type OrderProfitQueryFailure = {
  ok: false;
  error: string;
};

export type OrderProfitQueryResult = OrderProfitQuerySuccess | OrderProfitQueryFailure;

/**
 * API DTO semantics:
 * - productRevenue and shippingRevenue are net of refunds.
 * - netRevenue = productRevenue + shippingRevenue.
 * - grossRevenue = netRevenue + refundsProduct + refundsShipping.
 */
export type OrderProfitResponseDto = {
  ok: true;
  shop: string;
  range: {
    start: string;
    end: string;
  };
  orders: OrderProfitResult["orders"];
  warnings: string[];
};

export function parseOrderProfitQuery(input: OrderProfitQueryInput): OrderProfitQueryResult {
  if (!input.shop) {
    return { ok: false, error: "Missing shop. Provide ?shop=<myshop>.myshopify.com." };
  }

  const timezone = normalizeShopTimezone(input.timezone);
  const today = input.now ?? new Date();
  const defaultEndDateKey = toTimeZoneDateKey(today, timezone);
  const defaultStartDateKey = addDaysToDateKey(defaultEndDateKey, -29);
  const parsedStartDateKey = parseDateKey(input.start) ? input.start! : defaultStartDateKey;
  const parsedEndDateKey = parseDateKey(input.end) ? input.end! : defaultEndDateKey;
  const { start: startDate } = dayBoundsForDateKey(parsedStartDateKey, timezone);
  const { end: endDate } = dayBoundsForDateKey(parsedEndDateKey, timezone);

  return {
    ok: true,
    query: {
      shopDomain: input.shop,
      startDateKey: parsedStartDateKey,
      endDateKey: parsedEndDateKey,
      startDate,
      endDate,
    },
  };
}

export function toOrderProfitResponseDto(
  shopDomain: string,
  startDateKey: string,
  endDateKey: string,
  result: OrderProfitResult,
): OrderProfitResponseDto {
  return {
    ok: true,
    shop: shopDomain,
    range: {
      start: startDateKey,
      end: endDateKey,
    },
    orders: result.orders,
    warnings: result.warnings,
  };
}
