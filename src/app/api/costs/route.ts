import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateApiRequest, isAuthorizedForShop } from "@/lib/auth";
import { logError } from "@/observability";

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const productId: string | undefined = body?.productId;
    const costPerUnitRaw = body?.costPerUnit;
    const shopDomain: string | undefined = body?.shop;

    if (!productId || costPerUnitRaw === undefined) {
      return NextResponse.json(
        { error: "productId and costPerUnit are required" },
        { status: 400 },
      );
    }

    const parsedCost = Number(costPerUnitRaw);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return NextResponse.json({ error: "Invalid costPerUnit" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { shopDomain: true } } },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!isAuthorizedForShop(auth, product.shop.shopDomain)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (shopDomain && product.shop.shopDomain !== shopDomain) {
      return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { costPerUnit: parsedCost },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("update_cost_failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
