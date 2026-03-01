import { NextResponse } from "next/server";
import { ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest, requireAuthorizedShopRole } from "@/lib/auth";
import { logError } from "@/observability";

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const productId: string | undefined = body?.productId;
    const variantId: string | undefined = body?.variantId;
    const costPerUnitRaw = body?.costPerUnit;
    const shopDomain: string | undefined = body?.shop;
    const targetType: "product" | "variant" = body?.targetType === "variant" ? "variant" : "product";
    const targetId = targetType === "variant" ? variantId : productId;

    if (!targetId || costPerUnitRaw === undefined) {
      return NextResponse.json(
        { error: `${targetType}Id and costPerUnit are required` },
        { status: 400 },
      );
    }

    const parsedCost =
      costPerUnitRaw === "" || costPerUnitRaw == null ? null : Number(costPerUnitRaw);
    if (parsedCost != null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      return NextResponse.json({ error: "Invalid costPerUnit" }, { status: 400 });
    }

    const target =
      targetType === "variant"
        ? await prisma.variant.findUnique({
            where: { id: targetId },
            include: { shop: { select: { shopDomain: true } } },
          })
        : await prisma.product.findUnique({
            where: { id: targetId },
            include: { shop: { select: { shopDomain: true } } },
          });

    if (!target) {
      return NextResponse.json(
        { error: targetType === "variant" ? "Variant not found" : "Product not found" },
        { status: 404 },
      );
    }
    const roleGuard = requireAuthorizedShopRole(auth, target.shop.shopDomain, ShopRole.ADMIN);
    if (roleGuard) {
      return roleGuard;
    }

    if (shopDomain && target.shop.shopDomain !== shopDomain) {
      return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
    }

    if (targetType === "variant") {
      await prisma.variant.update({
        where: { id: targetId },
        data: { costPerUnit: parsedCost },
      });
    } else {
      await prisma.product.update({
        where: { id: targetId },
        data: { costPerUnit: parsedCost },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("update_cost_failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
