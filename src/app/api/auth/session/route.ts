import { NextResponse } from "next/server";
import { authenticateShopifyRequest } from "@/lib/shopifySession";
import { establishSessionFromToken } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = authenticateShopifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const session = await establishSessionFromToken(
    auth.shop,
    auth.payload as unknown as Record<string, unknown>,
  );

  return NextResponse.json({
    ok: true,
    shop: auth.shop,
    payload: auth.payload,
    session: {
      subjectExternalId: session.subjectExternalId,
      shops: session.shops,
      rolesByShop: session.rolesByShop,
    },
  });
}
