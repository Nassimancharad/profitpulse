import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logInfo, logWarn } from "@/observability/logger";
import { syncMetaSpend } from "@/ingestion";
import { parseCronMaxPages, verifyCronRequest } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CronResult = {
  shop: string;
  status: "ok" | "skipped" | "error";
  details?: unknown;
};

function parseEnvNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const maxPages = parseCronMaxPages(
    url.searchParams.get("maxPages"),
    parseEnvNumber(process.env.CRON_META_MAX_PAGES),
  );

  const shops = await prisma.shop.findMany({
    where: { metaAdAccounts: { some: {} } },
    select: { shopDomain: true },
  });

  const results: CronResult[] = [];

  for (const shop of shops) {
    const result = await syncMetaSpend({
      shopDomain: shop.shopDomain,
      start,
      end,
      maxPages,
    });

    if (result.ok) {
      results.push({ shop: shop.shopDomain, status: "ok", details: result.result });
      continue;
    }

    if (result.status === 409) {
      results.push({ shop: shop.shopDomain, status: "skipped", details: result.error });
      continue;
    }

    results.push({ shop: shop.shopDomain, status: "error", details: result.error });
    logWarn("cron_meta_sync_failed", { shop: shop.shopDomain, status: result.status, error: result.error });
  }

  const summary = {
    ok: true,
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "error").length,
  };

  logInfo("cron_meta_sync_complete", summary);

  return NextResponse.json({ ...summary, results });
}
