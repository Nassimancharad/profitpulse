import crypto from "node:crypto";
import { ShopRole } from "@prisma/client";
import { normalizeSafeReturnPath } from "@/lib/embeddedAppContext";
import { EMAIL_USER_PROVIDER, SHOPIFY_USER_PROVIDER } from "@/lib/userAccounts";

export const APP_SESSION_COOKIE = "pp_session";
export const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthorizationMode = "shopify_full_access" | "role_based";
export type SessionKind = "shopify" | "standalone";
export type SessionProvider = typeof SHOPIFY_USER_PROVIDER | typeof EMAIL_USER_PROVIDER;

export type AppSessionPayload = {
  kind?: SessionKind;
  provider?: SessionProvider;
  sessionId?: string;
  shops: string[];
  roles?: Record<string, ShopRole>;
  sub?: string;
  userId?: string;
  iat: number;
  exp: number;
};

export type AuthorizedSessionData = {
  kind: SessionKind;
  provider: SessionProvider;
  sessionId?: string | null;
  shops: string[];
  rolesByShop?: Record<string, ShopRole>;
  subjectExternalId?: string | null;
  actorUserId?: string | null;
};

export type SessionData = {
  kind: SessionKind;
  provider: SessionProvider;
  sessionId: string | null;
  actorUserId: string | null;
  actorExternalId: string | null;
  shops: string[];
  rolesByShop: Record<string, ShopRole>;
};

export type CookieSessionData = SessionData & {
  ok: true;
  source: "cookie";
};

export type SessionCookiePolicy = {
  sameSite: "none" | "lax";
  secure: boolean;
  partitioned: boolean;
};

export function resolveSessionCookiePolicyFromEnv(input: {
  appUrl?: string | null;
  nodeEnv?: string | null;
}): SessionCookiePolicy {
  const appUrl = input.appUrl ?? "";
  const isHttps = /^https:\/\//i.test(appUrl);
  const isLocalhost = /:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(appUrl);
  const isProduction = input.nodeEnv === "production";

  if (isHttps && (isProduction || !isLocalhost)) {
    return {
      sameSite: "none",
      secure: true,
      partitioned: true,
    };
  }

  return {
    sameSite: "lax",
    secure: false,
    partitioned: false,
  };
}

export function resolveUnauthenticatedAppPageDestination(input: {
  embedded?: string | null;
  host?: string | null;
  shop?: string | null;
  returnTo?: string | null;
}) {
  if (input.embedded === "1" || Boolean(input.host)) {
    const params = new URLSearchParams();
    if (input.shop) {
      params.set("shop", input.shop);
    }
    if (input.host) {
      params.set("host", input.host);
    }
    if (input.embedded) {
      params.set("embedded", input.embedded);
    }
    const returnTo = normalizeSafeReturnPath(input.returnTo, "");
    if (returnTo) {
      params.set("return_to", returnTo);
    }
    params.set("auth", "bootstrap");

    const query = params.toString();
    return query ? `/connections?${query}` : "/connections";
  }

  return "/login";
}

export function getApiSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SHOPIFY_API_SECRET");
  }
  return secret;
}

export function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function normalizeShopDomain(shop: string | null | undefined): string | null {
  if (!shop) return null;
  const normalized = shop.trim().toLowerCase();
  if (!normalized.endsWith(".myshopify.com") || normalized.split(".").length < 3) {
    return null;
  }
  return normalized;
}

export function sanitizeShops(shops: string[]) {
  return Array.from(
    new Set(
      shops
        .map((shop) => normalizeShopDomain(shop))
        .filter((shop): shop is string => Boolean(shop)),
    ),
  );
}

export function sanitizeRoleMap(input: unknown, allowedShops: Set<string>) {
  if (!input || typeof input !== "object") {
    return {} as Record<string, ShopRole>;
  }

  const next: Record<string, ShopRole> = {};
  for (const [rawShop, rawRole] of Object.entries(input as Record<string, unknown>)) {
    const shop = normalizeShopDomain(rawShop);
    if (!shop || !allowedShops.has(shop)) {
      continue;
    }
    if (rawRole === ShopRole.ADMIN || rawRole === ShopRole.EDITOR || rawRole === ShopRole.VIEWER) {
      next[shop] = rawRole;
    }
  }
  return next;
}

export function resolveAuthorizationMode(): AuthorizationMode {
  return process.env.PP_AUTHORIZATION_MODE === "role_based" ? "role_based" : "shopify_full_access";
}

export function rolesRecordToMap(kind: SessionKind, shops: string[], rolesByShop: Record<string, ShopRole>) {
  const map = new Map<string, ShopRole>();
  const authorizationMode = resolveAuthorizationMode();

  for (const shop of shops) {
    if (kind === "shopify" && authorizationMode === "shopify_full_access") {
      map.set(shop, ShopRole.ADMIN);
      continue;
    }

    map.set(shop, rolesByShop[shop] ?? ShopRole.VIEWER);
  }

  return map;
}
