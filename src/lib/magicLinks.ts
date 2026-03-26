import crypto from "node:crypto";
import { ShopRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { setStandaloneSessionCookie } from "@/lib/auth";
import { EMAIL_USER_PROVIDER, normalizeEmailAddress } from "@/lib/userAccounts";

const MAGIC_LINK_TTL_MINUTES = 20;
const STANDALONE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type UserMembership = {
  role: ShopRole;
  shop: {
    shopDomain: string;
  };
};

function normalizeShopDomain(shop: string | null | undefined): string | null {
  if (!shop) return null;
  const normalized = shop.trim().toLowerCase();
  if (!normalized.endsWith(".myshopify.com") || normalized.split(".").length < 3) {
    return null;
  }
  return normalized;
}

function mapMembershipsToRoles(memberships: UserMembership[]) {
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

export function createMagicLinkToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashMagicLinkToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function defaultMagicLinkExpiry(now = new Date()) {
  return new Date(now.getTime() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);
}

function defaultStandaloneSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + STANDALONE_SESSION_TTL_MS);
}

export function buildMagicLinkUrl(token: string, origin?: string | null) {
  const configuredBaseUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const baseUrl = configuredBaseUrl || origin?.replace(/\/+$/, "") || "http://localhost:3000";
  return `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
}

export async function createMagicLinkLogin(input: {
  email: string;
  origin?: string | null;
  requestedFromIp?: string | null;
  requestedUserAgent?: string | null;
}) {
  const normalizedEmail = normalizeEmailAddress(input.email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false as const, status: 400, error: "Provide a valid email address." };
  }

  const user = await prisma.appUser.findUnique({
    where: {
      provider_externalId: {
        provider: EMAIL_USER_PROVIDER,
        externalId: normalizedEmail,
      },
    },
    select: {
      id: true,
      email: true,
      memberships: {
        select: {
          role: true,
          shop: { select: { shopDomain: true } },
        },
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    return {
      ok: true as const,
      email: normalizedEmail,
      loginLink: null,
      expiresAt: null,
    };
  }

  const token = createMagicLinkToken();
  const tokenHash = hashMagicLinkToken(token);
  const expiresAt = defaultMagicLinkExpiry();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.magicLinkToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    await tx.magicLinkToken.create({
      data: {
        userId: user.id,
        email: normalizedEmail,
        tokenHash,
        expiresAt,
        requestedFromIp: input.requestedFromIp ?? undefined,
        requestedUserAgent: input.requestedUserAgent ?? undefined,
      },
    });
  });

  return {
    ok: true as const,
    email: normalizedEmail,
    loginLink: buildMagicLinkUrl(token, input.origin),
    expiresAt,
  };
}

export async function consumeMagicLinkToken(input: {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const normalizedToken = input.token.trim();
  if (!normalizedToken) {
    return { ok: false as const, status: 400, error: "Missing magic link token.", code: "missing" as const };
  }

  const tokenHash = hashMagicLinkToken(normalizedToken);

  const consumed = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.magicLinkToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        email: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (!record) {
      return { ok: false as const, status: 404, error: "This magic link is invalid.", code: "invalid" as const };
    }

    if (record.consumedAt) {
      return { ok: false as const, status: 410, error: "This magic link was already used.", code: "used" as const };
    }

    if (record.expiresAt < now) {
      return { ok: false as const, status: 410, error: "This magic link has expired.", code: "expired" as const };
    }

    const updateResult = await tx.magicLinkToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        consumedAt: now,
      },
    });

    if (updateResult.count !== 1) {
      return { ok: false as const, status: 410, error: "This magic link was already used.", code: "used" as const };
    }

    const user = record.userId
      ? await tx.appUser.findUnique({
          where: { id: record.userId },
          select: {
            id: true,
            email: true,
            externalId: true,
            memberships: {
              select: {
                role: true,
                shop: { select: { shopDomain: true } },
              },
            },
          },
        })
      : await tx.appUser.findUnique({
          where: {
            provider_externalId: {
              provider: EMAIL_USER_PROVIDER,
              externalId: normalizeEmailAddress(record.email),
            },
          },
          select: {
            id: true,
            email: true,
            externalId: true,
            memberships: {
              select: {
                role: true,
                shop: { select: { shopDomain: true } },
              },
            },
          },
        });

    if (!user || user.memberships.length === 0) {
      return { ok: false as const, status: 403, error: "No shop access found for this account.", code: "no_access" as const };
    }

    const appSession = await tx.appSession.create({
      data: {
        userId: user.id,
        kind: "standalone",
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
        expiresAt: defaultStandaloneSessionExpiry(),
      },
      select: {
        id: true,
      },
    });

    return {
      ok: true as const,
      user,
      appSessionId: appSession.id,
    };
  });

  if (!consumed.ok) {
    return consumed;
  }

  const { shops, rolesByShop } = mapMembershipsToRoles(consumed.user.memberships);
  if (!shops.length) {
    return { ok: false as const, status: 403, error: "No shop access found for this account.", code: "no_access" as const };
  }

  const email = normalizeEmailAddress(consumed.user.email || consumed.user.externalId);
  await setStandaloneSessionCookie({
    sessionId: consumed.appSessionId,
    userId: consumed.user.id,
    email,
    shops,
    rolesByShop,
  });

  return {
    ok: true as const,
    userId: consumed.user.id,
    email,
    shops,
    rolesByShop,
  };
}
