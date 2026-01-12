import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOrderProfitBreakdown } from '@/lib/orderProfit';

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get('shop');
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  if (!shopDomain) {
    return NextResponse.json(
      { error: 'Missing shop. Provide ?shop=<myshop>.myshopify.com.' },
      { status: 400 },
    );
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  const today = new Date();
  const defaultEnd = atEndOfDay(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultEnd.getDate() - 29);

  const parsedStart = parseDate(startParam) ?? defaultStart;
  const parsedEnd = parseDate(endParam) ?? defaultEnd;

  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);

  const { orders, warnings } = await getOrderProfitBreakdown(shop.id, startDate, endDate);

  // Payload semantics: "productRevenue" and "shippingRevenue" are net of refunds.
  // Explicit fields (netProductRevenue, netShippingRevenue, refundsProduct, refundsShipping,
  // paymentFeeEstimated, paymentFeeActual) are included for clarity and remain additive.
  return NextResponse.json({
    ok: true,
    shop: shop.shopDomain,
    range: {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    },
    orders,
    warnings,
  });
}
