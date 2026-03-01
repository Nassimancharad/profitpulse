import crypto from "node:crypto";
import { ShopRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateShopifyRequest } from "@/lib/shopifySession";
import { logWarn } from "@/observability";

const APP_SESSION_COOKIE = "pp_session";
const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AppSessionPayload = {
  shops: string[];
  roles?: Record<string, ShopRole>;
  sub?: string;
  iat: number;
  exp: number;
};

type ApiAuthSuccess = {
  ok: true;
  authorizedShops: Set<string>;
  shopRoles: Map<string, ShopRole>;
  actorExternalId: string | null;
  source: "token" | "cookie";
};

type ApiAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;

type AuthorizedSessionData = {
  shops: string[];
  rolesByShop?: Record<string, ShopRole>;
  subjectExternalId?: string | null;
};

type SessionData = {
  subjectExternalId: string;
  shops: string[];
  rolesByShop: Record<string, ShopRole>;
};

export type SessionCookiePolicy = {
  sameSite: "none" | "lax";
  secure: boolean;
};

export function resolveSessionCookiePolicyFromEnv(input: {
  appUrl?: string | null;
  nodeEnv?: string | null;
}): SessionCookiePolicy {
  const appUrl = input.appUrl ?? "";
  const isHttps = /^https:\/\//i.test(appUrl);
  const isLocalhost = /:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(appUrl);
  const isProduction = input.nodeEnv === "production";

  // Embedded production/staging apps require cross-site cookie semantics.
  if (isHttps && (isProduction || !isLocalhost)) {
    return {
      sameSite: "none" as const,
      secure: true,
    };
  }

  // Local HTTP development on localhost is more reliable with Lax + non-secure cookies.
  return {
    sameSite: "lax" as const,
    secure: false,
  };
}

function resolveSessionCookiePolicy() {
  return resolveSessionCookiePolicyFromEnv({
    appUrl: process.env.SHOPIFY_APP_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

function getApiSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SHOPIFY_API_SECRET");
  }
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function normalizeShopDomain(shop: string | null | undefined): string | null {
  if (!shop) return null;
  const normalized = shop.trim().toLowerCase();
  if (!normalized.endsWith(".myshopify.com") || normalized.split(".").length < 3) {
    return null;
  }
  return normalized;
}

function sanitizeShops(shops: string[]) {
  return Array.from(
    new Set(
      shops
        .map((shop) => normalizeShopDomain(shop))
        .filter((shop): shop is string => Boolean(shop)),
    ),
  );
}

function sanitizeRoleMap(input: unknown, allowedShops: Set<string>) {
  if (!input || typeof input !== "object") {
    return {} as Record<string, ShopRole>;
  }

  const next: Record<string, ShopRole> = {};
  for (const [rawShop, rawRole] of Object.entries(input as Record<string, unknown>)) {
    const shop = normalizeShopDomain(rawShop);
    if (!shop || !allowedShops.has(shop)) {
      continue;
    }
    if (rawRole === ShopRole.ADMIN || rawRole === ShopRole.VIEWER) {
      next[shop] = rawRole;
    }
  }
  return next;
}

function rolesRecordToMap(shops: string[], rolesByShop: Record<string, ShopRole>) {
  const map = new Map<string, ShopRole>();
  for (const shop of shops) {
    map.set(shop, rolesByShop[shop] ?? ShopRole.VIEWER);
  }
  return map;
}

function parseCookieHeader(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [cookieKey, ...rest] = part.trim().split("=");
    if (cookieKey === key) {
      return rest.join("=") || null;
    }
  }
  return null;
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSignedSessionValue(payload: AppSessionPayload, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifySignedSessionValue(value: string | null | undefined, secret: string): AppSessionPayload | null {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AppSessionPayload>;
    const shops = sanitizeShops(Array.isArray(parsed.shops) ? parsed.shops : []);
    const shopSet = new Set(shops);
    const roles = sanitizeRoleMap(parsed.roles, shopSet);
    const exp = typeof parsed.exp === "number" ? parsed.exp : 0;
    const iat = typeof parsed.iat === "number" ? parsed.iat : 0;
    const sub = typeof parsed.sub === "string" ? parsed.sub : undefined;

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return null;
    if (!shops.length) return null;

    return {
      shops,
      roles,
      sub,
      iat,
      exp,
    };
  } catch {
    return null;
  }
}

export async function getAuthorizedShopsFromCookie(): Promise<string[]> {
  const session = await getAuthorizedSessionFromCookie();
  return session.shops;
}

export async function getAuthorizedSessionFromCookie(): Promise<{
  shops: string[];
  rolesByShop: Record<string, ShopRole>;
  subjectExternalId: string | null;
}> {
  try {
    const secret = getApiSecret();
    const cookieStore = await cookies();
    const value = cookieStore.get(APP_SESSION_COOKIE)?.value;
    const payload = verifySignedSessionValue(value, secret);
    return {
      shops: payload?.shops ?? [],
      rolesByShop: payload?.roles ?? {},
      subjectExternalId: payload?.sub ?? null,
    };
  } catch {
    return {
      shops: [],
      rolesByShop: {},
      subjectExternalId: null,
    };
  }
}

export async function setAuthorizedSessionCookie(data: AuthorizedSessionData) {
  const secret = getApiSecret();
  const normalizedShops = sanitizeShops(data.shops);
  if (!normalizedShops.length) {
    await clearAuthorizedShopsCookie();
    return;
  }

  const shopSet = new Set(normalizedShops);
  const sanitizedRoles = sanitizeRoleMap(data.rolesByShop ?? {}, shopSet);
  const now = Math.floor(Date.now() / 1000);
  const payload: AppSessionPayload = {
    shops: normalizedShops,
    roles: Object.keys(sanitizedRoles).length ? sanitizedRoles : undefined,
    sub: data.subjectExternalId ?? undefined,
    iat: now,
    exp: now + APP_SESSION_TTL_SECONDS,
  };

  const value = createSignedSessionValue(payload, secret);
  const cookieStore = await cookies();
  const policy = resolveSessionCookiePolicy();
  cookieStore.set(APP_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  });
}

export async function setAuthorizedShopsCookie(shops: string[]) {
  await setAuthorizedSessionCookie({ shops });
}

export async function extendAuthorizedShopsCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedSessionFromCookie();
  await setAuthorizedSessionCookie({
    shops: [...existing.shops, normalized],
    rolesByShop: existing.rolesByShop,
    subjectExternalId: existing.subjectExternalId,
  });
}

export async function removeAuthorizedShopFromCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedSessionFromCookie();
  await setAuthorizedSessionCookie({
    shops: existing.shops.filter((shop) => shop !== normalized),
    rolesByShop: existing.rolesByShop,
    subjectExternalId: existing.subjectExternalId,
  });
}

export async function clearAuthorizedShopsCookie() {
  const cookieStore = await cookies();
  const policy = resolveSessionCookiePolicy();
  cookieStore.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    path: "/",
    maxAge: 0,
  });
}

export async function requireAppPageAuth() {
  const session = await getAuthorizedSessionFromCookie();
  const authorizedShops = session.shops;
  if (!authorizedShops.length) {
    redirect("/connections?auth=required");
  }

  return {
    authorizedShops,
    authorizedShopSet: new Set(authorizedShops),
    shopRoles: rolesRecordToMap(authorizedShops, session.rolesByShop),
    actorExternalId: session.subjectExternalId,
  };
}

export function resolveRequestedShop(queryShop: string | null, bodyShop: string | null) {
  const normalizedQuery = normalizeShopDomain(queryShop);
  const normalizedBody = normalizeShopDomain(bodyShop);

  if (queryShop && !normalizedQuery) {
    return { ok: false as const, error: "Invalid query shop domain" };
  }
  if (bodyShop && !normalizedBody) {
    return { ok: false as const, error: "Invalid body shop domain" };
  }
  if (normalizedQuery && normalizedBody && normalizedQuery !== normalizedBody) {
    return { ok: false as const, error: "Shop mismatch between query and body" };
  }

  return {
    ok: true as const,
    shopDomain: normalizedQuery ?? normalizedBody,
  };
}

export function getShopRoleForDomain(
  auth: Pick<ApiAuthSuccess, "authorizedShops" | "shopRoles">,
  shopDomain: string | null | undefined,
): ShopRole | null {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized || !auth.authorizedShops.has(normalized)) {
    return null;
  }
  return auth.shopRoles.get(normalized) ?? ShopRole.VIEWER;
}

export function hasRequiredRole(role: ShopRole | null, requiredRole: ShopRole) {
  if (!role) return false;
  if (requiredRole === ShopRole.VIEWER) {
    return role === ShopRole.VIEWER || role === ShopRole.ADMIN;
  }
  return role === ShopRole.ADMIN;
}

export function isAuthorizedForShop(auth: ApiAuthSuccess, shopDomain: string | null | undefined) {
  const role = getShopRoleForDomain(auth, shopDomain);
  return hasRequiredRole(role, ShopRole.VIEWER);
}

export function isAuthorizedForShopRole(
  auth: ApiAuthSuccess,
  shopDomain: string | null | undefined,
  requiredRole: ShopRole,
) {
  const role = getShopRoleForDomain(auth, shopDomain);
  return hasRequiredRole(role, requiredRole);
}

export function requireAuthorizedShop(
  auth: ApiAuthSuccess,
  shopDomain: string | null | undefined,
) {
  if (isAuthorizedForShop(auth, shopDomain)) {
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function requireAuthorizedShopRole(
  auth: ApiAuthSuccess,
  shopDomain: string | null | undefined,
  requiredRole: ShopRole,
) {
  if (isAuthorizedForShopRole(auth, shopDomain, requiredRole)) {
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function deriveDisplayName(payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name) return name;
  const firstName = typeof payload.first_name === "string" ? payload.first_name.trim() : "";
  const lastName = typeof payload.last_name === "string" ? payload.last_name.trim() : "";
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
}

async function resolveUserSessionDataForSubjectExternalId(subjectExternalId: string): Promise<SessionData | null> {
  try {
    const user = await prisma.appUser.findUnique({
      where: {
        provider_externalId: {
          provider: "shopify",
          externalId: subjectExternalId,
        },
      },
      select: {
        externalId: true,
        memberships: {
          select: {
            role: true,
            shop: { select: { shopDomain: true } },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const rolesByShop = user.memberships.reduce<Record<string, ShopRole>>((acc, membership) => {
      const normalizedShop = normalizeShopDomain(membership.shop.shopDomain);
      if (normalizedShop) {
        acc[normalizedShop] = membership.role;
      }
      return acc;
    }, {});

    const shops = Object.keys(rolesByShop);
    return {
      subjectExternalId: user.externalId,
      shops,
      rolesByShop,
    };
  } catch (error) {
    logWarn("rbac_cookie_membership_revalidation_failed", {
      subjectExternalId,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

async function resolveUserSessionDataForToken(shopDomain: string, payload: Record<string, unknown>): Promise<SessionData> {
  const subjectExternalId = typeof payload.sub === "string" ? payload.sub : "";
  if (!subjectExternalId) {
    return {
      subjectExternalId: "",
      shops: [shopDomain],
      rolesByShop: { [shopDomain]: ShopRole.ADMIN },
    };
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!shop) {
      return {
        subjectExternalId,
        shops: [shopDomain],
        rolesByShop: { [shopDomain]: ShopRole.ADMIN },
      };
    }

    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
    const displayName = deriveDisplayName(payload);

    const data = await prisma.$transaction(async (tx) => {
      const user = await tx.appUser.upsert({
        where: {
          provider_externalId: {
            provider: "shopify",
            externalId: subjectExternalId,
          },
        },
        create: {
          provider: "shopify",
          externalId: subjectExternalId,
          email: email || undefined,
          displayName: displayName || undefined,
        },
        update: {
          email: email || undefined,
          displayName: displayName || undefined,
        },
        select: { id: true },
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
        const hasMemberships =
          (await tx.shopMembership.count({
            where: { shopId: shop.id },
          })) > 0;

        await tx.shopMembership.create({
          data: {
            userId: user.id,
            shopId: shop.id,
            role: hasMemberships ? ShopRole.VIEWER : ShopRole.ADMIN,
          },
        });
      }

      return tx.shopMembership.findMany({
        where: { userId: user.id },
        select: {
          role: true,
          shop: { select: { shopDomain: true } },
        },
      });
    });

    const rolesByShop = data.reduce<Record<string, ShopRole>>((acc, membership) => {
      const normalizedShop = normalizeShopDomain(membership.shop.shopDomain);
      if (normalizedShop) {
        acc[normalizedShop] = membership.role;
      }
      return acc;
    }, {});
    const shops = Object.keys(rolesByShop);

    if (!shops.length) {
      return {
        subjectExternalId,
        shops: [shopDomain],
        rolesByShop: { [shopDomain]: ShopRole.ADMIN },
      };
    }

    return {
      subjectExternalId,
      shops,
      rolesByShop,
    };
  } catch (error) {
    logWarn("rbac_user_membership_resolve_failed", {
      shopDomain,
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return {
      subjectExternalId,
      shops: [shopDomain],
      rolesByShop: { [shopDomain]: ShopRole.VIEWER },
    };
  }
}

export async function establishSessionFromToken(shopDomain: string, payload: Record<string, unknown>) {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    throw new Error("Invalid shop domain");
  }

  const sessionData = await resolveUserSessionDataForToken(normalizedShop, payload);
  await setAuthorizedSessionCookie({
    shops: sessionData.shops,
    rolesByShop: sessionData.rolesByShop,
    subjectExternalId: sessionData.subjectExternalId,
  });

  return sessionData;
}

export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const tokenAuth = authenticateShopifyRequest(request);
  if (tokenAuth.ok) {
    const sessionData = await resolveUserSessionDataForToken(
      tokenAuth.shop,
      tokenAuth.payload as unknown as Record<string, unknown>,
    );

    return {
      ok: true,
      authorizedShops: new Set(sessionData.shops),
      shopRoles: rolesRecordToMap(sessionData.shops, sessionData.rolesByShop),
      actorExternalId: sessionData.subjectExternalId,
      source: "token",
    };
  }

  try {
    const secret = getApiSecret();
    const cookieValue = parseCookieHeader(request.headers.get("cookie"), APP_SESSION_COOKIE);
    const payload = verifySignedSessionValue(cookieValue, secret);

    if (payload?.shops.length) {
      const cookieShops = sanitizeShops(payload.shops);
      if (payload.sub) {
        const dbSession = await resolveUserSessionDataForSubjectExternalId(payload.sub);
        if (dbSession) {
          const rolesByShop = cookieShops.reduce<Record<string, ShopRole>>((acc, shop) => {
            const role = dbSession.rolesByShop[shop];
            if (role) {
              acc[shop] = role;
            }
            return acc;
          }, {});
          const authorizedShops = Object.keys(rolesByShop);
          return {
            ok: true,
            authorizedShops: new Set(authorizedShops),
            shopRoles: rolesRecordToMap(authorizedShops, rolesByShop),
            actorExternalId: dbSession.subjectExternalId,
            source: "cookie",
          };
        }
      }

      // Fail closed: when DB revalidation is unavailable, keep read access only.
      const downgradedRoles = cookieShops.reduce<Record<string, ShopRole>>((acc, shop) => {
        acc[shop] = ShopRole.VIEWER;
        return acc;
      }, {});
      return {
        ok: true,
        authorizedShops: new Set(cookieShops),
        shopRoles: rolesRecordToMap(cookieShops, downgradedRoles),
        actorExternalId: payload.sub ?? null,
        source: "cookie",
      };
    }
  } catch {
    // no-op
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
