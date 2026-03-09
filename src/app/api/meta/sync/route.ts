import { NextResponse } from "next/server";
import { ShopRole } from "@prisma/client";
import { syncMetaSpend } from "@/ingestion";
import { authenticateApiRequest, requireAuthorizedShopRole, resolveRequestedShop } from "@/lib/auth";
import { requireFeatureForShop } from "@/lib/planGate";

function parseMaxPages(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : null;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const queryStart = url.searchParams.get("start");
  const queryEnd = url.searchParams.get("end");
  const queryMaxPages = parseMaxPages(url.searchParams.get("maxPages"));

  let bodyShop: string | null = null;
  let bodyStart: string | null = null;
  let bodyEnd: string | null = null;
  let bodyMaxPages: number | undefined = undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
    if (body && typeof body.start === "string") bodyStart = body.start;
    if (body && typeof body.end === "string") bodyEnd = body.end;
    if (body && typeof body.maxPages === "number" && Number.isFinite(body.maxPages) && body.maxPages > 0) {
      bodyMaxPages = Math.floor(body.maxPages);
    }
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

  const planGuard = await requireFeatureForShop({
    shopDomain: resolvedShop.shopDomain,
    feature: "META_SYNC",
  });
  if (planGuard) {
    return planGuard;
  }

  const result = await syncMetaSpend({
    shopDomain: resolvedShop.shopDomain,
    start: queryStart ?? bodyStart,
    end: queryEnd ?? bodyEnd,
    maxPages: queryMaxPages ?? bodyMaxPages,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, synced: result.result });
}
