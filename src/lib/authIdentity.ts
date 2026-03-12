import { ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { normalizeShopDomain, type SessionData } from "@/lib/authShared";
import { EMAIL_USER_PROVIDER, SHOPIFY_USER_PROVIDER, normalizeEmailAddress, upsertUserByProviderIdentity } from "@/lib/userAccounts";
import { logWarn } from "@/observability";

type DbClient = typeof prisma;

export function mapMembershipsToRoles(
  memberships: Array<{ role: ShopRole; shop: { shopDomain: string } }>,
) {
  const rolesByShop = memberships.reduce<Record<string, ShopRole>>((acc, membership) => {
    const normalizedShop = normalizeShopDomain(membership.shop.shopDomain);
    if (normalizedShop) {
      acc[normalizedShop] = membership.role;
    }
    return acc;
  }, {});

  return {
    shops: Object.keys(rolesByShop),
    rolesByShop,
  };
}

export async function resolveSessionDataForUserId(userId: string, db: DbClient = prisma): Promise<SessionData | null> {
  try {
    const user = await db.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        provider: true,
        externalId: true,
        memberships: {
          select: {
            role: true,
            shop: { select: { shopDomain: true } },
          },
        },
      },
    });

    if (!user) return null;

    const { shops, rolesByShop } = mapMembershipsToRoles(user.memberships);
    return {
      kind: user.provider === EMAIL_USER_PROVIDER ? "standalone" : "shopify",
      provider: user.provider === EMAIL_USER_PROVIDER ? EMAIL_USER_PROVIDER : SHOPIFY_USER_PROVIDER,
      sessionId: null,
      actorUserId: user.id,
      actorExternalId: user.externalId,
      shops,
      rolesByShop,
    };
  } catch (error) {
    logWarn("user_session_revalidation_failed", {
      userId,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

export async function resolveSessionDataForProviderIdentity(
  provider: typeof SHOPIFY_USER_PROVIDER | typeof EMAIL_USER_PROVIDER,
  externalId: string,
  db: DbClient = prisma,
): Promise<SessionData | null> {
  try {
    const user = await db.appUser.findUnique({
      where: {
        provider_externalId: {
          provider,
          externalId,
        },
      },
      select: {
        id: true,
        externalId: true,
        memberships: {
          select: {
            role: true,
            shop: { select: { shopDomain: true } },
          },
        },
      },
    });

    if (!user) return null;

    const { shops, rolesByShop } = mapMembershipsToRoles(user.memberships);
    return {
      kind: provider === EMAIL_USER_PROVIDER ? "standalone" : "shopify",
      provider,
      sessionId: null,
      actorUserId: user.id,
      actorExternalId: user.externalId,
      shops,
      rolesByShop,
    };
  } catch (error) {
    logWarn("provider_session_revalidation_failed", {
      provider,
      externalId,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

function deriveDisplayName(payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name) return name;
  const firstName = typeof payload.first_name === "string" ? payload.first_name.trim() : "";
  const lastName = typeof payload.last_name === "string" ? payload.last_name.trim() : "";
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
}

export async function resolveUserSessionDataForToken(
  shopDomain: string,
  payload: Record<string, unknown>,
  db: DbClient = prisma,
): Promise<SessionData> {
  const subjectExternalId = typeof payload.sub === "string" ? payload.sub : "";
  if (!subjectExternalId) {
    return {
      kind: "shopify",
      provider: SHOPIFY_USER_PROVIDER,
      sessionId: null,
      actorUserId: null,
      actorExternalId: null,
      shops: [shopDomain],
      rolesByShop: { [shopDomain]: ShopRole.ADMIN },
    };
  }

  try {
    const shop = await db.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return {
        kind: "shopify",
        provider: SHOPIFY_USER_PROVIDER,
        sessionId: null,
        actorUserId: null,
        actorExternalId: subjectExternalId,
        shops: [shopDomain],
        rolesByShop: { [shopDomain]: ShopRole.ADMIN },
      };
    }

    const email = normalizeEmailAddress(typeof payload.email === "string" ? payload.email : null) || null;
    const displayName = deriveDisplayName(payload);

    const data = await db.$transaction(async (tx) => {
      const user = await upsertUserByProviderIdentity({
        db: tx,
        provider: SHOPIFY_USER_PROVIDER,
        externalId: subjectExternalId,
        email,
        displayName,
      });

      const existingMembership = await tx.shopMembership.findUnique({
        where: {
          userId_shopId: {
            userId: user.id,
            shopId: shop.id,
          },
        },
        select: { id: true },
      });

      if (!existingMembership) {
        const hasMemberships = (await tx.shopMembership.count({ where: { shopId: shop.id } })) > 0;
        await tx.shopMembership.create({
          data: {
            userId: user.id,
            shopId: shop.id,
            role: hasMemberships ? ShopRole.VIEWER : ShopRole.ADMIN,
          },
        });
      }

      const memberships = await tx.shopMembership.findMany({
        where: { userId: user.id },
        select: {
          role: true,
          shop: { select: { shopDomain: true } },
        },
      });

      return {
        userId: user.id,
        externalId: user.externalId,
        memberships,
      };
    });

    const { shops, rolesByShop } = mapMembershipsToRoles(data.memberships);
    if (!shops.length) {
      return {
        kind: "shopify",
        provider: SHOPIFY_USER_PROVIDER,
        sessionId: null,
        actorUserId: data.userId,
        actorExternalId: data.externalId,
        shops: [shopDomain],
        rolesByShop: { [shopDomain]: ShopRole.ADMIN },
      };
    }

    return {
      kind: "shopify",
      provider: SHOPIFY_USER_PROVIDER,
      sessionId: null,
      actorUserId: data.userId,
      actorExternalId: data.externalId,
      shops,
      rolesByShop,
    };
  } catch (error) {
    logWarn("rbac_user_membership_resolve_failed", {
      shopDomain,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return {
      kind: "shopify",
      provider: SHOPIFY_USER_PROVIDER,
      sessionId: null,
      actorUserId: null,
      actorExternalId: subjectExternalId,
      shops: [shopDomain],
      rolesByShop: { [shopDomain]: ShopRole.VIEWER },
    };
  }
}
