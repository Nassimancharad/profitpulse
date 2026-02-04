import { NextResponse } from "next/server";
import { syncShopifyPayments } from "@/ingestion";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop");
  const queryStart = url.searchParams.get("start");
  const queryEnd = url.searchParams.get("end");
  const queryMaxPages = url.searchParams.get("maxPages");

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

  const result = await syncShopifyPayments({
    shopDomain: queryShop ?? bodyShop,
    start: queryStart ?? bodyStart,
    end: queryEnd ?? bodyEnd,
    maxPages: queryMaxPages,
  });

  if (!result.ok) {
    if (result.status === 502 && result.reason) {
      const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
      const origin = appUrl ?? new URL(request.url).origin;
      const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(queryShop ?? bodyShop ?? "")}&payments=${result.reason}`;
      return NextResponse.redirect(redirectUrl, 303);
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(result.result.shopDomain)}&payments=synced`;
  return NextResponse.redirect(redirectUrl, 303);
}
