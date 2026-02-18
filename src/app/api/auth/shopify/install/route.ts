import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

const SHOPIFY_AUTHORIZE_URL = "https://{shop}/admin/oauth/authorize";

const requiredEnv = ["SHOPIFY_API_KEY", "SHOPIFY_SCOPES", "SHOPIFY_APP_URL"] as const;

function getEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const normalize = (url: string) => url.replace(/\/+$/, "");

  return {
    apiKey: process.env.SHOPIFY_API_KEY!,
    scopes: process.env.SHOPIFY_SCOPES!,
    appUrl: normalize(process.env.SHOPIFY_APP_URL!),
  };
}

function isValidShopDomain(shop: string | null): shop is string {
  if (!shop) return false;
  try {
    const url = new URL(`https://${shop}`);
    return (
      !!url.hostname &&
      url.hostname.endsWith(".myshopify.com") &&
      url.hostname.split(".").length >= 3
    );
  } catch {
    return false;
  }
}

function buildRedirectUrl(shop: string, state: string, env: ReturnType<typeof getEnv>) {
  const redirectUri = `${env.appUrl}/api/auth/shopify/callback`;
  const params = new URLSearchParams({
    client_id: env.apiKey,
    scope: env.scopes,
    redirect_uri: redirectUri,
    state,
  });

  return SHOPIFY_AUTHORIZE_URL.replace("{shop}", shop) + `?${params.toString()}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");
  const origin = new URL(request.url).origin;
  const appBase =
    process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") ||
    origin;
  const isSecure = appBase.startsWith("https://");

  if (!isValidShopDomain(shop)) {
    return NextResponse.redirect(`${appBase}/connections?shopify=invalid_shop`);
  }

  let env;
  try {
    env = getEnv();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server misconfiguration" },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUrl = buildRedirectUrl(shop, state, env);

  const cookieStore = await cookies();
  cookieStore.set("shopify_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: 300, // 5 minutes
  });

  return NextResponse.redirect(redirectUrl);
}
