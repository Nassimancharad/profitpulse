import { NextResponse } from "next/server";
import { parseDate, parseMaxPages, parseShopifySyncMode, syncShopifyStoreData } from "@/ingestion";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const maxPages = parseMaxPages(url.searchParams.get("maxPages"));
  const mode = parseShopifySyncMode(url.searchParams.get("mode"));
  const queryStart = parseDate(url.searchParams.get("start"));

  let bodyShop: string | null = null;
  let bodyStart: Date | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
    if (body && typeof body.start === "string") bodyStart = parseDate(body.start);
  } catch {
    // no-op: query params remain source of truth
  }

  const result = await syncShopifyStoreData({
    shopDomain: queryShop ?? bodyShop,
    maxPages,
    mode,
    start: queryStart ?? bodyStart ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
