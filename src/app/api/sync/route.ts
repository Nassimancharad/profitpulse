import { NextResponse } from "next/server";
import { parseMaxPages, syncShopifyStoreData } from "@/ingestion";
import { authenticateApiRequest, isAuthorizedForShop, resolveRequestedShop } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

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

  const resolvedShop = resolveRequestedShop(queryShop, bodyShop);
  if (!resolvedShop.ok) {
    return NextResponse.json({ error: resolvedShop.error }, { status: 400 });
  }
  if (!resolvedShop.shopDomain) {
    return NextResponse.json({ error: "Missing shop. Provide ?shop=<myshop>.myshopify.com." }, { status: 400 });
  }
  if (!isAuthorizedForShop(auth, resolvedShop.shopDomain)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncShopifyStoreData({
    shopDomain: resolvedShop.shopDomain,
    maxPages,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
