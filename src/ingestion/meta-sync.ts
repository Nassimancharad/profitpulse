import prisma from "@/lib/prisma";
import { fetchMetaDailySpend } from "@/lib/meta";
import { acquireSyncLock, recordSyncError, recordSyncSuccess } from "@/data/syncState";
import { buildIdempotencyKey, finishJobRun, startJobRun } from "@/jobs";

export type MetaSyncResult = {
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

export function parseMetaSyncWindow(
  start: string | null,
  end: string | null,
  now = new Date(),
  fallbackStart?: Date,
) {
  const defaultEnd = atEndOfDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const defaultStart = atStartOfDay(new Date(defaultEnd));
  defaultStart.setFullYear(defaultEnd.getFullYear() - 2);

  const parsedStart = parseDate(start) ?? fallbackStart ?? defaultStart;
  const parsedEnd = parseDate(end) ?? defaultEnd;
  return {
    startDate: atStartOfDay(parsedStart),
    endDate: atEndOfDay(parsedEnd),
  };
}

export async function syncMetaSpend(params: {
  shopDomain: string | null;
  start: string | null;
  end: string | null;
}): Promise<{ ok: true; result: MetaSyncResult } | { ok: false; status: number; error: string }> {
  if (!params.shopDomain) {
    return {
      ok: false,
      status: 400,
      error: "Missing shop. Provide ?shop=<myshop>.myshopify.com or in JSON body.",
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: params.shopDomain },
    include: { metaAdAccounts: true },
  });

  if (!shop) return { ok: false, status: 404, error: "Shop not found" };
  if (!shop.metaAdAccounts.length) {
    return { ok: false, status: 400, error: "No connected Meta ad accounts for this shop" };
  }

  const lock = await acquireSyncLock({ shopId: shop.id, resource: "META" });
  if (!lock.ok) {
    return {
      ok: false,
      status: 409,
      error: "Meta sync already running. Try again in a few minutes.",
    };
  }

  const overlapMs = 7 * 24 * 60 * 60 * 1000;
  const fallbackStart = lock.state.lastSyncedAt
    ? new Date(lock.state.lastSyncedAt.getTime() - overlapMs)
    : undefined;
  let { startDate, endDate } = parseMetaSyncWindow(params.start, params.end, new Date(), fallbackStart);
  let rangeDays = countRangeDays(startDate, endDate);
  const maxRangeDays = 90;
  if (!params.start && rangeDays > maxRangeDays) {
    const adjustedStart = new Date(endDate);
    adjustedStart.setDate(adjustedStart.getDate() - (maxRangeDays - 1));
    startDate = atStartOfDay(adjustedStart);
    rangeDays = countRangeDays(startDate, endDate);
  }

  if (rangeDays === 0 || startDate > endDate) {
    await recordSyncError({
      shopId: shop.id,
      resource: "META",
      error: "Invalid date range. Ensure start <= end.",
    });
    return { ok: false, status: 400, error: "Invalid date range. Ensure start <= end." };
  }

  if (rangeDays > maxRangeDays) {
    const message = `Date range too large (${rangeDays} days). Use <= ${maxRangeDays} days per sync.`;
    await recordSyncError({
      shopId: shop.id,
      resource: "META",
      error: message,
    });
    return {
      ok: false,
      status: 400,
      error: message,
    };
  }

  const idempotencyKey = buildIdempotencyKey([
    "meta-sync",
    shop.shopDomain,
    startDate.toISOString().slice(0, 10),
    endDate.toISOString().slice(0, 10),
  ]);
  const run = startJobRun({
    name: "meta-sync",
    scope: shop.shopDomain,
    cursor: `${startDate.toISOString().slice(0, 10)}..${endDate.toISOString().slice(0, 10)}`,
    idempotencyKey,
  });

  let totalInserted = 0;

  try {
    for (const account of shop.metaAdAccounts) {
      const insights = await fetchMetaDailySpend(account.adAccountId, account.accessToken, startDate, endDate);

      await prisma.adSpend.deleteMany({
        where: {
          shopId: shop.id,
          adAccountId: account.adAccountId,
          date: { gte: startDate, lte: endDate },
        },
      });

      if (insights.length === 0) continue;

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

    finishJobRun(run, "ok");
    await recordSyncSuccess({ shopId: shop.id, resource: "META" });
    return {
      ok: true,
      result: {
        shopDomain: shop.shopDomain,
        dateRange: {
          start: startDate.toISOString().slice(0, 10),
          end: endDate.toISOString().slice(0, 10),
        },
        accountsProcessed: shop.metaAdAccounts.length,
        spendsInserted: totalInserted,
      },
    };
  } catch (error) {
    finishJobRun(run, "error");
    const message = error instanceof Error ? error.message : "Failed to sync Meta spend";
    await recordSyncError({ shopId: shop.id, resource: "META", error: message });
    return { ok: false, status: 500, error: message };
  }
}
