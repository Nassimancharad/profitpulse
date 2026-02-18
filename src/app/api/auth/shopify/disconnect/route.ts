import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  authenticateApiRequest,
  isAuthorizedForShop,
  removeAuthorizedShopFromCookie,
} from "@/lib/auth";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  const origin = new URL(request.url).origin;
  const appBase =
    process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") ||
    origin;

  if (!shopDomain) {
    return NextResponse.redirect(`${appBase}/connections?shopify=missing_shop`);
  }

  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!isAuthorizedForShop(auth, shopDomain)) {
    return NextResponse.redirect(`${appBase}/connections?shopify=forbidden`);
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return NextResponse.redirect(`${appBase}/connections?shopify=not_found`);
  }

  const shopId = shop.id;

  await prisma.orderLine.deleteMany({ where: { order: { shopId } } });
  await prisma.order.deleteMany({ where: { shopId } });
  await prisma.campaignProduct.deleteMany({ where: { shopId } });
  await prisma.metaCampaign.deleteMany({ where: { shopId } });
  await prisma.adSpend.deleteMany({ where: { shopId } });
  await prisma.product.deleteMany({ where: { shopId } });
  await prisma.metaAdAccount.deleteMany({ where: { shopId } });
  await prisma.shop.delete({ where: { id: shopId } });
  await removeAuthorizedShopFromCookie(shopDomain);

  return NextResponse.redirect(`${appBase}/connections?shopify=disconnected`);
}
