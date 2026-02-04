import prisma from "@/lib/prisma";

export async function getShopIdByDomain(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true },
  });

  return shop;
}
