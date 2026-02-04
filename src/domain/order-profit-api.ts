import type { OrderProfitResult } from "@/domain/profit-engine/order-profit";

type OrderProfitQueryInput = {
  shop: string | null;
  start: string | null;
  end: string | null;
  now?: Date;
};

type OrderProfitQuerySuccess = {
  ok: true;
  query: {
    shopDomain: string;
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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atStartOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function atEndOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function parseOrderProfitQuery(input: OrderProfitQueryInput): OrderProfitQueryResult {
  if (!input.shop) {
    return { ok: false, error: "Missing shop. Provide ?shop=<myshop>.myshopify.com." };
  }

  const today = input.now ?? new Date();
  const defaultEnd = atEndOfDay(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDate(input.start) ?? defaultStart;
  const parsedEnd = parseDate(input.end) ?? defaultEnd;

  return {
    ok: true,
    query: {
      shopDomain: input.shop,
      startDate: atStartOfDay(parsedStart),
      endDate: atEndOfDay(parsedEnd),
    },
  };
}

export function toOrderProfitResponseDto(
  shopDomain: string,
  startDate: Date,
  endDate: Date,
  result: OrderProfitResult,
): OrderProfitResponseDto {
  return {
    ok: true,
    shop: shopDomain,
    range: {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    },
    orders: result.orders,
    warnings: result.warnings,
  };
}
