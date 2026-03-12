import { ShopRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  EMBEDDED_APP_FLAG_COOKIE,
  EMBEDDED_APP_HOST_COOKIE,
} from "@/lib/embeddedAppContext";
import { authenticateShopifyRequest } from "@/lib/shopifySession";
import { resolveSessionDataForProviderIdentity, resolveSessionDataForUserId, resolveUserSessionDataForToken } from "@/lib/authIdentity";
import { clearSignedSessionCookie, getSignedSessionPayloadFromCookieHeader, setSignedSessionCookie } from "@/lib/authCookie";
import { resolveStandaloneCookieSession } from "@/lib/authStandalone";
import {
  APP_SESSION_TTL_SECONDS,
  normalizeShopDomain,
  resolveSessionCookiePolicyFromEnv,
  resolveUnauthenticatedAppPageDestination,
  rolesRecordToMap,
  sanitizeRoleMap,
  sanitizeShops,
  type AppSessionPayload,
  type AuthorizedSessionData,
  type CookieSessionData,
  type SessionCookiePolicy,
  type SessionKind,
  type SessionProvider,
  type SessionData,
} from "@/lib/authShared";
import { EMAIL_USER_PROVIDER, SHOPIFY_USER_PROVIDER, normalizeEmailAddress } from "@/lib/userAccounts";

type ApiAuthSuccess = SessionData & {
  ok: true;
  authorizedShops: Set<string>;
  shopRoles: Map<string, ShopRole>;
  source: "token" | "cookie";
};

type ApiAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type ApiAuthResult = ApiAuthSuccess | ApiAuthFailure;
export type { SessionCookiePolicy } from "@/lib/authShared";
export { resolveSessionCookiePolicyFromEnv, resolveUnauthenticatedAppPageDestination } from "@/lib/authShared";

function resolveSessionCookiePolicy() {
  return resolveSessionCookiePolicyFromEnv({
    appUrl: process.env.SHOPIFY_APP_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

async function resolveSessionDataForCookiePayload(payload: AppSessionPayload): Promise<CookieSessionData | null> {
  if (payload.kind === "standalone") {
    return resolveStandaloneCookieSession(payload);
  }

  const byUserId = payload.userId ? await resolveSessionDataForUserId(payload.userId) : null;
  if (byUserId) {
    return { ...byUserId, ok: true, source: "cookie" };
  }

  if (payload.sub) {
    const byIdentity = await resolveSessionDataForProviderIdentity(payload.provider ?? SHOPIFY_USER_PROVIDER, payload.sub);
    if (byIdentity) {
      return { ...byIdentity, ok: true, source: "cookie" };
    }
  }

  if (payload.kind === "shopify") {
    const cookieShops = sanitizeShops(payload.shops);
    const downgradedRoles = cookieShops.reduce<Record<string, ShopRole>>((acc, shop) => {
      acc[shop] = ShopRole.ADMIN;
      return acc;
    }, {});

    return {
      ok: true,
      source: "cookie",
      kind: "shopify",
      provider: SHOPIFY_USER_PROVIDER,
      sessionId: null,
      actorUserId: payload.userId ?? null,
      actorExternalId: payload.sub ?? null,
      shops: cookieShops,
      rolesByShop: downgradedRoles,
    };
  }

  return null;
}

export async function resolveCookieSessionFromHeader(cookieHeader: string | null): Promise<CookieSessionData | null> {
  try {
    const payload = await getSignedSessionPayloadFromCookieHeader(cookieHeader);
    if (!payload?.shops.length) {
      return null;
    }

    return resolveSessionDataForCookiePayload(payload);
  } catch {
    return null;
  }
}

async function resolveCookieSession(): Promise<CookieSessionData | null> {
  const cookieStore = await cookies();
  const serialized = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  return resolveCookieSessionFromHeader(serialized);
}

export async function getAuthorizedShopsFromCookie(): Promise<string[]> {
  const session = await getAuthorizedSessionFromCookie();
  return session.shops;
}

export async function getAuthorizedSessionFromCookie(): Promise<{
  kind: SessionKind | null;
  provider: SessionProvider | null;
  sessionId: string | null;
  shops: string[];
  rolesByShop: Record<string, ShopRole>;
  actorUserId: string | null;
  subjectExternalId: string | null;
}> {
  const session = await resolveCookieSession();
  return {
    kind: session?.kind ?? null,
    provider: session?.provider ?? null,
    sessionId: session?.sessionId ?? null,
    shops: session?.shops ?? [],
    rolesByShop: session?.rolesByShop ?? {},
    actorUserId: session?.actorUserId ?? null,
    subjectExternalId: session?.actorExternalId ?? null,
  };
}

export async function setAuthorizedSessionCookie(data: AuthorizedSessionData) {
  const normalizedShops = sanitizeShops(data.shops);
  if (!normalizedShops.length) {
    await clearAuthorizedShopsCookie();
    return;
  }

  const shopSet = new Set(normalizedShops);
  const sanitizedRoles = sanitizeRoleMap(data.rolesByShop ?? {}, shopSet);
  const now = Math.floor(Date.now() / 1000);
  const payload: AppSessionPayload = {
    kind: data.kind,
    provider: data.provider,
    sessionId: data.sessionId ?? undefined,
    shops: normalizedShops,
    roles: Object.keys(sanitizedRoles).length ? sanitizedRoles : undefined,
    sub: data.subjectExternalId ?? undefined,
    userId: data.actorUserId ?? undefined,
    iat: now,
    exp: now + APP_SESSION_TTL_SECONDS,
  };

  await setSignedSessionCookie(payload, resolveSessionCookiePolicy(), APP_SESSION_TTL_SECONDS);
}

export async function setAuthorizedShopsCookie(shops: string[]) {
  await setAuthorizedSessionCookie({
    kind: "shopify",
    provider: SHOPIFY_USER_PROVIDER,
    shops,
  });
}

export async function setStandaloneSessionCookie(data: {
  sessionId: string;
  userId: string;
  email: string;
  shops: string[];
  rolesByShop: Record<string, ShopRole>;
}) {
  await setAuthorizedSessionCookie({
    kind: "standalone",
    provider: EMAIL_USER_PROVIDER,
    sessionId: data.sessionId,
    actorUserId: data.userId,
    subjectExternalId: normalizeEmailAddress(data.email),
    shops: data.shops,
    rolesByShop: data.rolesByShop,
  });
}

export async function extendAuthorizedShopsCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedSessionFromCookie();
  await setAuthorizedSessionCookie({
    kind: existing.kind ?? "shopify",
    provider: existing.provider ?? SHOPIFY_USER_PROVIDER,
    sessionId: existing.sessionId,
    shops: [...existing.shops, normalized],
    rolesByShop: existing.rolesByShop,
    subjectExternalId: existing.subjectExternalId,
    actorUserId: existing.actorUserId,
  });
}

export async function removeAuthorizedShopFromCookie(shopDomain: string) {
  const normalized = normalizeShopDomain(shopDomain);
  if (!normalized) return;

  const existing = await getAuthorizedSessionFromCookie();
  await setAuthorizedSessionCookie({
    kind: existing.kind ?? "shopify",
    provider: existing.provider ?? SHOPIFY_USER_PROVIDER,
    sessionId: existing.sessionId,
    shops: existing.shops.filter((shop) => shop !== normalized),
    rolesByShop: existing.rolesByShop,
    subjectExternalId: existing.subjectExternalId,
    actorUserId: existing.actorUserId,
  });
}

export async function clearAuthorizedShopsCookie() {
  await clearSignedSessionCookie(resolveSessionCookiePolicy());
}

export async function requireAppPageAuth() {
  const session = await getAuthorizedSessionFromCookie();
  const authorizedShops = session.shops;
  if (!authorizedShops.length) {
    const cookieStore = await cookies();
    redirect(
      resolveUnauthenticatedAppPageDestination({
        embedded: cookieStore.get(EMBEDDED_APP_FLAG_COOKIE)?.value ?? null,
        host: cookieStore.get(EMBEDDED_APP_HOST_COOKIE)?.value ?? null,
      }),
    );
  }

  return {
    sessionKind: session.kind,
    provider: session.provider,
    sessionId: session.sessionId,
    authorizedShops,
    authorizedShopSet: new Set(authorizedShops),
    shopRoles: rolesRecordToMap(session.kind ?? "shopify", authorizedShops, session.rolesByShop),
    actorUserId: session.actorUserId,
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
    return role === ShopRole.VIEWER || role === ShopRole.EDITOR || role === ShopRole.ADMIN;
  }
  if (requiredRole === ShopRole.EDITOR) {
    return role === ShopRole.EDITOR || role === ShopRole.ADMIN;
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

export function requireAuthorizedShop(auth: ApiAuthSuccess, shopDomain: string | null | undefined) {
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

export async function establishSessionFromToken(shopDomain: string, payload: Record<string, unknown>) {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    throw new Error("Invalid shop domain");
  }

  const sessionData = await resolveUserSessionDataForToken(normalizedShop, payload);
  await setAuthorizedSessionCookie({
    kind: "shopify",
    provider: SHOPIFY_USER_PROVIDER,
    sessionId: sessionData.sessionId,
    shops: sessionData.shops,
    rolesByShop: sessionData.rolesByShop,
    subjectExternalId: sessionData.actorExternalId,
    actorUserId: sessionData.actorUserId,
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
      ...sessionData,
      authorizedShops: new Set(sessionData.shops),
      shopRoles: rolesRecordToMap(sessionData.kind, sessionData.shops, sessionData.rolesByShop),
      source: "token",
    };
  }

  const session = await resolveCookieSessionFromHeader(request.headers.get("cookie"));
  if (session?.shops.length) {
    const { ok: _ok, ...cookieSession } = session;
    return {
      ok: true,
      ...cookieSession,
      authorizedShops: new Set(cookieSession.shops),
      shopRoles: rolesRecordToMap(cookieSession.kind, cookieSession.shops, cookieSession.rolesByShop),
    };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
