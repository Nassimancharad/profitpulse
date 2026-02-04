import { NextResponse } from "next/server";
import { parseMaxPages, syncShopifyStoreData } from "@/ingestion";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const maxPages = parseMaxPages(url.searchParams.get("maxPages"));

  let bodyShop: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
  } catch {
    // no-op: query params remain source of truth
  }

  const result = await syncShopifyStoreData({
    shopDomain: queryShop ?? bodyShop,
    maxPages,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
