import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  const origin = new URL(request.url).origin;
  const appBase = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") || origin;

  if (!shopDomain) {
    return NextResponse.redirect(`${appBase}/connections?meta=missing_shop`);
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.redirect(`${appBase}/connections?meta=not_found`);
  }

  await prisma.metaCampaign.deleteMany({ where: { shopId: shop.id } });
  await prisma.metaAdAccount.deleteMany({ where: { shopId: shop.id } });

  return NextResponse.redirect(`${appBase}/connections?meta=disconnected`);
}
