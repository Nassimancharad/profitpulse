import prisma from "@/lib/prisma";

export type AuthorizedShopOption = {
  id: string;
  shopDomain: string;
};

export async function listAuthorizedShopOptions(authorizedShops: string[]): Promise<AuthorizedShopOption[]> {
  return prisma.shop.findMany({
    where: { shopDomain: { in: authorizedShops } },
    select: { id: true, shopDomain: true },
    orderBy: { installedAt: "desc" },
  });
}

export function resolveActiveShop<T extends AuthorizedShopOption>(
  shops: T[],
  selectedDomain?: string | null,
): T | null {
  const selectedShop = selectedDomain
    ? shops.find((candidate) => candidate.shopDomain === selectedDomain) ?? null
    : null;

  return selectedShop ?? (shops.length === 1 ? shops[0] : null);
}
