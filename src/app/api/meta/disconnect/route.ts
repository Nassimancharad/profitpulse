import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  const origin = new URL(request.url).origin;

  if (!shopDomain) {
    return NextResponse.redirect(`${origin}/settings?meta=missing_shop`);
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.redirect(`${origin}/settings?meta=not_found`);
  }

  await prisma.metaCampaign.deleteMany({ where: { shopId: shop.id } });
  await prisma.metaAdAccount.deleteMany({ where: { shopId: shop.id } });

  return NextResponse.redirect(`${origin}/settings?meta=disconnected`);
}
