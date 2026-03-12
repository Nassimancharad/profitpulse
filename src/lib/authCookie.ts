import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { AppSessionPayload, SessionCookiePolicy } from "@/lib/authShared";
import {
  APP_SESSION_COOKIE,
  base64UrlDecode,
  base64UrlEncode,
  getApiSecret,
  sanitizeRoleMap,
  sanitizeShops,
  timingSafeEqual,
} from "@/lib/authShared";
import { EMAIL_USER_PROVIDER, SHOPIFY_USER_PROVIDER } from "@/lib/userAccounts";

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function parseCookieHeader(cookieHeader: string | null, key: string): string | null {
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

export function createSignedSessionValue(payload: AppSessionPayload, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedSessionValue(value: string | null | undefined, secret: string): AppSessionPayload | null {
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
    const userId = typeof parsed.userId === "string" ? parsed.userId : undefined;
    const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : undefined;
    const kind = parsed.kind === "standalone" ? "standalone" : "shopify";
    const provider =
      parsed.provider === EMAIL_USER_PROVIDER ? EMAIL_USER_PROVIDER : SHOPIFY_USER_PROVIDER;

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return null;
    if (!shops.length) return null;

    return {
      kind,
      provider,
      sessionId,
      shops,
      roles,
      sub,
      userId,
      iat,
      exp,
    };
  } catch {
    return null;
  }
}

export async function getSignedSessionPayloadFromCookieHeader(cookieHeader: string | null) {
  const secret = getApiSecret();
  const cookieValue = parseCookieHeader(cookieHeader, APP_SESSION_COOKIE);
  return verifySignedSessionValue(cookieValue, secret);
}

export async function setSignedSessionCookie(payload: AppSessionPayload, policy: SessionCookiePolicy, maxAge: number) {
  const secret = getApiSecret();
  const value = createSignedSessionValue(payload, secret);
  const cookieStore = await cookies();
  cookieStore.set(APP_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    path: "/",
    maxAge,
  });
}

export async function clearSignedSessionCookie(policy: SessionCookiePolicy) {
  const cookieStore = await cookies();
  cookieStore.set(APP_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    path: "/",
    maxAge: 0,
  });
}
