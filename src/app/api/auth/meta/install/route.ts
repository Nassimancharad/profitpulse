import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { ShopRole } from "@prisma/client";
import { buildMetaAuthUrl } from "@/lib/meta";
import { authenticateApiRequest, isAuthorizedForShopRole } from "@/lib/auth";
import { requireFeatureForShop } from "@/lib/planGate";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop query parameter" }, { status: 400 });
  }
  if (!isAuthorizedForShopRole(auth, shop, ShopRole.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const planGuard = await requireFeatureForShop({
    shopDomain: shop,
    feature: "META_CONNECTIONS",
  });
  if (planGuard) {
    let reason = "plan_upgrade_required";
    try {
      const payload = (await planGuard.clone().json()) as { code?: string };
      if (payload?.code === "PLAN_INACTIVE") {
        reason = "plan_inactive";
      } else if (planGuard.status === 404) {
        reason = "not_found";
      }
    } catch {
      // keep default reason
    }

    const appBase = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
    const params = new URLSearchParams({ meta: reason, shop });
    return NextResponse.redirect(`${appBase}/connections?${params.toString()}`);
  }

  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing META_APP_SECRET" }, { status: 500 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const raw = `${shop}:${nonce}`;
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const state = `${shop}:${nonce}:${signature}`;

  let authUrl: string;
  try {
    authUrl = buildMetaAuthUrl(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build Meta OAuth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.redirect(authUrl);
}
