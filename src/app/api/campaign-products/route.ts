import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productId: string | undefined = body?.productId;
    const campaignId: string | undefined = body?.campaignId;
    const action: "add" | "remove" = body?.action === "remove" ? "remove" : "add";

    if (!productId || !campaignId) {
      return NextResponse.json({ error: "productId and campaignId are required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { shopId: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
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
