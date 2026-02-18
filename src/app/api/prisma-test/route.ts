import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const [shopCount, productCount, orderCount, orderLineCount, adSpendCount] =
      await Promise.all([
        prisma.shop.count(),
        prisma.product.count(),
        prisma.order.count(),
        prisma.orderLine.count(),
        prisma.adSpend.count(),
      ]);

    const shops = await prisma.shop.findMany({
      take: 5,
      orderBy: { installedAt: "desc" },
      select: {
        id: true,
        shopDomain: true,
        installedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      counts: { shops: shopCount, products: productCount, orders: orderCount, orderLines: orderLineCount, adSpends: adSpendCount },
      shops,
    });
  } catch (error) {
    console.error("Prisma test failed", error);

    return NextResponse.json(
      { ok: false, error: "Database connection failed" },
      { status: 500 },
    );
  }
}
