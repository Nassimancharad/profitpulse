import prisma from "@/lib/prisma";
import { fetchShopifyPaymentTransactions, type ShopifyPaymentTransaction } from "@/lib/shopifyAdmin";
import { acquireSyncLock, recordSyncError, recordSyncSuccess } from "@/data/syncState";
import { buildIdempotencyKey, finishJobRun, startJobRun } from "@/jobs";

export type ShopifyPaymentsSyncResult = {
  shopDomain: string;
  dateRange: { start: string; end: string };
  transactionsProcessed: number;
  ordersUpdated: number;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function atEndOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseMaxPages(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : null;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function syncShopifyPayments(params: {
  shopDomain: string | null;
  start: string | null;
  end: string | null;
  maxPages: string | null;
}): Promise<
  | { ok: true; result: ShopifyPaymentsSyncResult }
  | { ok: false; status: number; error: string; reason?: "unsupported" | "error" }
> {
  if (!params.shopDomain) {
    return {
      ok: false,
      status: 400,
      error: "Missing shop. Provide ?shop=<myshop>.myshopify.com or in JSON body.",
    };
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: params.shopDomain } });
  if (!shop) return { ok: false, status: 404, error: "Shop not found" };

  const lock = await acquireSyncLock({ shopId: shop.id, resource: "SHOPIFY_PAYMENTS" });
  if (!lock.ok) {
    return {
      ok: false,
      status: 409,
      error: "Shopify Payments sync already running. Try again in a few minutes.",
    };
  }

  const today = new Date();
  const defaultEnd = atEndOfDay(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const defaultStart = atStartOfDay(new Date(defaultEnd));
  defaultStart.setDate(defaultEnd.getDate() - 30);

  const overlapMs = 24 * 60 * 60 * 1000;
  const syncStateStart = lock.state.lastSyncedAt
    ? new Date(lock.state.lastSyncedAt.getTime() - overlapMs)
    : null;
  const parsedStart = parseDate(params.start) ?? syncStateStart ?? defaultStart;
  const parsedEnd = parseDate(params.end) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);
  const pageLimit = parseMaxPages(params.maxPages);

  const idempotencyKey = buildIdempotencyKey([
    "shopify-payments-sync",
    shop.shopDomain,
    startDate.toISOString().slice(0, 10),
    endDate.toISOString().slice(0, 10),
    pageLimit ?? null,
  ]);
  const run = startJobRun({
    name: "shopify-payments-sync",
    scope: shop.shopDomain,
    cursor: pageLimit ? `maxPages=${pageLimit}` : null,
    idempotencyKey,
  });

  let transactions: ShopifyPaymentTransaction[] = [];
  try {
    transactions = await fetchShopifyPaymentTransactions(
      shop.shopDomain,
      shop.accessToken,
      startDate.toISOString(),
      pageLimit ? { maxPages: pageLimit } : undefined,
    );
  } catch (error) {
    finishJobRun(run, "error");
    const message = error instanceof Error ? error.message : "Failed to fetch Shopify Payments transactions";
    await recordSyncError({ shopId: shop.id, resource: "SHOPIFY_PAYMENTS", error: message });
    return {
      ok: false,
      status: 502,
      error: message,
      reason: message.toLowerCase().includes("shopify payments") ? "unsupported" : "error",
    };
  }

  try {
    const feeByOrder = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.created_at) {
        const createdAt = new Date(tx.created_at);
        if (createdAt < startDate || createdAt > endDate) continue;
      }
      if (!tx?.source_id) continue;
      if (tx.type && !["charge", "refund"].includes(tx.type)) continue;
      const fee = Number(tx.fee ?? 0);
      if (!Number.isFinite(fee) || fee === 0) continue;
      const orderId = String(tx.source_id);
      feeByOrder.set(orderId, (feeByOrder.get(orderId) ?? 0) + Math.abs(fee));
    }

    let ordersUpdated = 0;
    for (const [shopifyOrderId, paymentFeeActual] of feeByOrder.entries()) {
      await prisma.order.updateMany({
        where: { shopId: shop.id, shopifyOrderId },
        data: { paymentFeeActual },
      });
      ordersUpdated += 1;
    }

    finishJobRun(run, "ok");
    await recordSyncSuccess({ shopId: shop.id, resource: "SHOPIFY_PAYMENTS" });
    return {
      ok: true,
      result: {
        shopDomain: shop.shopDomain,
        dateRange: {
          start: startDate.toISOString().slice(0, 10),
          end: endDate.toISOString().slice(0, 10),
        },
        transactionsProcessed: transactions.length,
        ordersUpdated,
      },
    };
  } catch (error) {
    finishJobRun(run, "error");
    const message = error instanceof Error ? error.message : "Failed to persist Shopify Payments data";
    await recordSyncError({ shopId: shop.id, resource: "SHOPIFY_PAYMENTS", error: message });
    return { ok: false, status: 500, error: message, reason: "error" };
  }
}
