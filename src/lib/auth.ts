import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authenticateShopifyRequest } from "@/lib/shopifySession";

const APP_SESSION_COOKIE = "pp_session";
const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AppSessionPayload = {
  shops: string[];
  iat: number;
  exp: number;
};

type ApiAuthSuccess = {
  ok: true;
  authorizedShops: Set<string>;
  source: "token" | "cookie";
};

type ApiAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;

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
    const exp = typeof parsed.exp === "number" ? parsed.exp : 0;
    const iat = typeof parsed.iat === "number" ? parsed.iat : 0;

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return null;
    if (!shops.length) return null;

    return {
      shops,
      iat,
      exp,
    };
  } catch {
    return null;
  }
}

function isSecureCookie() {
  const configuredUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  if (configuredUrl) {
    return configuredUrl.startsWith("https://");
  }
  return process.env.NODE_ENV === "production";
}

export async function getAuthorizedShopsFromCookie(): Promise<string[]> {
  try {
    const secret = getApiSecret();
    const cookieStore = await cookies();
    const value = cookieStore.get(APP_SESSION_COOKIE)?.value;
    const payload = verifySignedSessionValue(value, secret);
    return payload?.shops ?? [];
  } catch {
    return [];
  }
}

export async function setAuthorizedShopsCookie(shops: string[]) {
  const secret = getApiSecret();
  const normalizedShops = sanitizeShops(shops);
  if (!normalizedShops.length) {
    await clearAuthorizedShopsCookie();
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AppSessionPayload = {
    shops: normalizedShops,
    iat: now,
    exp: now + APP_SESSION_TTL_SECONDS,
  };

  const value = createSignedSessionValue(payload, secret);
  const cookieStore = await cookies();
  cookieStore.set(APP_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  });
}

export async function extendAuthorizedShopsCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedShopsFromCookie();
  await setAuthorizedShopsCookie([...existing, normalized]);
}

export async function removeAuthorizedShopFromCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedShopsFromCookie();
  await setAuthorizedShopsCookie(existing.filter((shop) => shop !== normalized));
}

export async function clearAuthorizedShopsCookie() {
  const cookieStore = await cookies();
  cookieStore.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function requireAppPageAuth() {
  const authorizedShops = await getAuthorizedShopsFromCookie();
  if (!authorizedShops.length) {
    redirect("/connections?auth=required");
  }

  return {
    authorizedShops,
    authorizedShopSet: new Set(authorizedShops),
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

export function isAuthorizedForShop(auth: ApiAuthSuccess, shopDomain: string | null | undefined) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return false;
  return auth.authorizedShops.has(normalized);
}

export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const tokenAuth = authenticateShopifyRequest(request);
  if (tokenAuth.ok) {
    return {
      ok: true,
      authorizedShops: new Set([tokenAuth.shop]),
      source: "token",
    };
  }

  try {
    const secret = getApiSecret();
    const cookieValue = parseCookieHeader(request.headers.get("cookie"), APP_SESSION_COOKIE);
    const payload = verifySignedSessionValue(cookieValue, secret);

    if (payload?.shops.length) {
      return {
        ok: true,
        authorizedShops: new Set(payload.shops),
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
