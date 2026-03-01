import { NextResponse } from "next/server";
import { ShopRole } from "@prisma/client";
import { parseFullSync, parseMaxPages, syncShopifyStoreData } from "@/ingestion";
import { authenticateApiRequest, requireAuthorizedShopRole, resolveRequestedShop } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const maxPages = parseMaxPages(url.searchParams.get("maxPages"));
  const queryFullSync = parseFullSync(url.searchParams.get("fullSync"));

  let bodyShop: string | null = null;
  let bodyFullSync = false;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
    if (body && typeof body.fullSync === "boolean") bodyFullSync = body.fullSync;
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
  const roleGuard = requireAuthorizedShopRole(auth, resolvedShop.shopDomain, ShopRole.ADMIN);
  if (roleGuard) {
    return roleGuard;
  }

  const result = await syncShopifyStoreData({
    shopDomain: resolvedShop.shopDomain,
    maxPages,
    fullSync: queryFullSync || bodyFullSync,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
