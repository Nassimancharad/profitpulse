import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fetchMetaDailySpend } from "@/lib/meta";

type SyncResult = {
  shopDomain: string;
  dateRange: { start: string; end: string };
  accountsProcessed: number;
  spendsInserted: number;
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

function countRangeDays(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / msPerDay) + 1;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

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

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { metaAdAccounts: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  if (!shop.metaAdAccounts.length) {
    return NextResponse.json(
      { error: "No connected Meta ad accounts for this shop" },
      { status: 400 },
    );
  }

  const today = new Date();
  const defaultEnd = atEndOfDay(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  // Default to last 2 years
  const defaultStart = atStartOfDay(new Date(defaultEnd));
  defaultStart.setFullYear(defaultEnd.getFullYear() - 2);

  const parsedStart = parseDate(startParam ?? bodyStart) ?? defaultStart;
  const parsedEnd = parseDate(endParam ?? bodyEnd) ?? defaultEnd;
  const startDate = atStartOfDay(parsedStart);
  const endDate = atEndOfDay(parsedEnd);
  const rangeDays = countRangeDays(startDate, endDate);
  const maxRangeDays = 90;

  if (rangeDays === 0 || startDate > endDate) {
    return NextResponse.json(
      { error: "Invalid date range. Ensure start <= end." },
      { status: 400 },
    );
  }

  if (rangeDays > maxRangeDays) {
    return NextResponse.json(
      { error: `Date range too large (${rangeDays} days). Use <= ${maxRangeDays} days per sync.` },
      { status: 400 },
    );
  }

  let totalInserted = 0;

  for (const account of shop.metaAdAccounts) {
    const insights = await fetchMetaDailySpend(account.adAccountId, account.accessToken, startDate, endDate);

    // Clear existing rows for this account and date range to avoid duplicates.
    await prisma.adSpend.deleteMany({
      where: {
        shopId: shop.id,
        adAccountId: account.adAccountId,
        date: { gte: startDate, lte: endDate },
      },
    });

    if (insights.length === 0) {
      continue;
    }

    await prisma.adSpend.createMany({
      data: insights.map((row) => ({
        shopId: shop.id,
        adAccountId: account.adAccountId,
        date: new Date(row.date),
        campaignId: row.campaignId ?? null,
        adsetId: row.adsetId ?? null,
        adId: row.adId ?? null,
        amountSpent: row.spend,
      })),
    });

    totalInserted += insights.length;
  }

  const result: SyncResult = {
    shopDomain: shop.shopDomain,
    dateRange: {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    },
    accountsProcessed: shop.metaAdAccounts.length,
    spendsInserted: totalInserted,
  };

  return NextResponse.json({ ok: true, synced: result });
}
