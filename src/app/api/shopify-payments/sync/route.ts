import { NextResponse } from "next/server";
import { syncShopifyPayments } from "@/ingestion";
import { authenticateApiRequest, isAuthorizedForShop, resolveRequestedShop } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const queryStart = url.searchParams.get("start");
  const queryEnd = url.searchParams.get("end");
  const queryMaxPages = url.searchParams.get("maxPages");
  const acceptsJson = request.headers.get("accept")?.includes("application/json");
  const forceJson = request.headers.get("x-pp-sync") === "1";
  const returnJson = acceptsJson || forceJson;

  let bodyShop: string | null = null;
  let bodyStart: string | null = null;
  let bodyEnd: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.shop === "string") bodyShop = body.shop;
    if (body && typeof body.start === "string") bodyStart = body.start;
    if (body && typeof body.end === "string") bodyEnd = body.end;
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

  const result = await syncShopifyPayments({
    shopDomain: resolvedShop.shopDomain,
    start: queryStart ?? bodyStart,
    end: queryEnd ?? bodyEnd,
    maxPages: queryMaxPages,
  });

  if (!result.ok) {
    if (returnJson) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.status === 502 && result.reason) {
      const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
      const origin = appUrl ?? new URL(request.url).origin;
      const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(resolvedShop.shopDomain)}&payments=${result.reason}`;
      return NextResponse.redirect(redirectUrl, 303);
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (returnJson) {
    return NextResponse.json({ ok: true, synced: result.result });
  }

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(result.result.shopDomain)}&payments=synced`;
  return NextResponse.redirect(redirectUrl, 303);
}
