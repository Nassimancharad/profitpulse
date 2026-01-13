import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchShopifyPaymentTransactions, type ShopifyPaymentTransaction } from "@/lib/shopifyAdmin";

type SyncResult = {
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

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const maxPagesParam = url.searchParams.get("maxPages");
  const maxPages = maxPagesParam ? Number.parseInt(maxPagesParam, 10) : null;
  const pageLimit = maxPages && Number.isFinite(maxPages) && maxPages > 0 ? maxPages : undefined;

  let bodyShop: string | null = null;
  let bodyStart: string | null = null;
  let bodyEnd: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") {
      bodyShop = body.shop;
    }
    if (body && typeof body.start === "string") {
      bodyStart = body.start;
    }
    if (body && typeof body.end === "string") {
      bodyEnd = body.end;
    }
  } catch {
    // ignore body parse errors; proceed with query param / fallback
  }

  const shopDomain = queryShop ?? bodyShop;
  if (!shopDomain) {
    return NextResponse.json(
      { error: "Missing shop. Provide ?shop=<myshop>.myshopify.com or in JSON body." },
      { status: 400 },
    );
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const today = new Date();
  const defaultEnd = atEndOfDay(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const defaultStart = atStartOfDay(new Date(defaultEnd));
  defaultStart.setDate(defaultEnd.getDate() - 30);

  const parsedStart = parseDate(startParam ?? bodyStart) ?? defaultStart;
  const parsedEnd = parseDate(endParam ?? bodyEnd) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  let transactions: ShopifyPaymentTransaction[] = [];
  try {
    transactions = await fetchShopifyPaymentTransactions(
      shop.shopDomain,
      shop.accessToken,
      startDate.toISOString(),
      pageLimit ? { maxPages: pageLimit } : undefined,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Shopify Payments transactions";
    const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
    const origin = appUrl ?? new URL(request.url).origin;
    const reason = message.toLowerCase().includes("shopify payments")
      ? "payments=unsupported"
      : "payments=error";
    const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(shop.shopDomain)}&${reason}`;
    return NextResponse.redirect(redirectUrl, 303);
  }

  const feeByOrder = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.created_at) {
      const createdAt = new Date(tx.created_at);
      if (createdAt < startDate || createdAt > endDate) {
        continue;
      }
    }
    if (!tx?.source_id) continue;
    if (tx.type && !["charge", "refund"].includes(tx.type)) {
      continue;
    }
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

  const result: SyncResult = {
    shopDomain: shop.shopDomain,
    dateRange: {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    },
    transactionsProcessed: transactions.length,
    ordersUpdated,
  };

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(shop.shopDomain)}&payments=synced`;
  return NextResponse.redirect(redirectUrl, 303);
}
