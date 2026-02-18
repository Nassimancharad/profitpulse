import prisma from "@/lib/prisma";

export async function getShopIdByDomain(shopDomain: string) {
  const shop = await (async () => {
    try {
      return await prisma.shop.findUnique({
        where: { shopDomain },
        select: { id: true, shopDomain: true, timezone: true },
      });
    } catch {
      const fallback = await prisma.shop.findUnique({
        where: { shopDomain },
        select: { id: true, shopDomain: true },
      });
      if (!fallback) return null;
      return { ...fallback, timezone: null };
    }
  })();

  return shop;
}
