import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop query parameter." }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const states = await prisma.syncState.findMany({
    where: { shopId: shop.id },
    orderBy: { resource: "asc" },
  });

  return NextResponse.json({ ok: true, shop, states });
}
