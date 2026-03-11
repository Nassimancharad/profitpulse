import { NextResponse } from "next/server";
import { ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest, requireAuthorizedShopRole } from "@/lib/auth";
import { requireFeatureForShop } from "@/lib/planGate";

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const productId: string | undefined = body?.productId;
    const campaignId: string | undefined = body?.campaignId;
    const action: "add" | "remove" = body?.action === "remove" ? "remove" : "add";

    if (!productId || !campaignId) {
      return NextResponse.json({ error: "productId and campaignId are required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { shopId: true, shop: { select: { shopDomain: true } } },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const roleGuard = requireAuthorizedShopRole(auth, product.shop.shopDomain, ShopRole.ADMIN);
    if (roleGuard) {
      return roleGuard;
    }

    const planGuard = await requireFeatureForShop({
      shopDomain: product.shop.shopDomain,
      feature: "CAMPAIGN_MAPPING",
    });
    if (planGuard) {
      return planGuard;
    }

    if (action === "remove") {
      await prisma.campaignProduct.deleteMany({
        where: { productId, campaignId },
      });
      return NextResponse.json({ ok: true, removed: true });
    }

    await prisma.campaignProduct.upsert({
      where: {
        productId_campaignId: {
          productId,
          campaignId,
        },
      },
      update: {},
      create: { productId, campaignId, shopId: product.shopId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update campaign mapping", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
