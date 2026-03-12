import prisma from "@/lib/prisma";
import { mapMembershipsToRoles } from "@/lib/authIdentity";
import type { AppSessionPayload, CookieSessionData } from "@/lib/authShared";
import { EMAIL_USER_PROVIDER, SHOPIFY_USER_PROVIDER } from "@/lib/userAccounts";

type DbClient = typeof prisma;

export async function resolveStandaloneCookieSession(
  payload: AppSessionPayload,
  db: DbClient = prisma,
): Promise<CookieSessionData | null> {
  if (!payload.sessionId) {
    return null;
  }

  const appSession = await db.appSession.findUnique({
    where: { id: payload.sessionId },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
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
      },
    },
  });

  if (!appSession || appSession.revokedAt || appSession.expiresAt < new Date()) {
    return null;
  }

  await db.appSession.update({
    where: { id: appSession.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  const { shops, rolesByShop } = mapMembershipsToRoles(appSession.user.memberships);
  return {
    ok: true,
    source: "cookie",
    kind: "standalone",
    provider: payload.provider === SHOPIFY_USER_PROVIDER ? SHOPIFY_USER_PROVIDER : EMAIL_USER_PROVIDER,
    sessionId: appSession.id,
    actorUserId: appSession.user.id,
    actorExternalId: appSession.user.externalId,
    shops,
    rolesByShop,
  };
}
