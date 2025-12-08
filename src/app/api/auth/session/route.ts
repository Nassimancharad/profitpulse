import { NextResponse } from "next/server";
import { authenticateShopifyRequest } from "@/lib/shopifySession";

export async function GET(request: Request) {
  const auth = authenticateShopifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    shop: auth.shop,
    payload: auth.payload,
  });
}
