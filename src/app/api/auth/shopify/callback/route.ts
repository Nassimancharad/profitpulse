import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { fetchShopifyShop } from "@/lib/shopifyAdmin";
import { normalizeCurrencyCode } from "@/lib/currency";
import { normalizeShopTimezone } from "@/lib/timezone";
import { logWarn } from "@/observability";

const requiredEnv = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"] as const;

function getEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  const normalize = (url: string) => url.replace(/\/+$/, "");
  return {
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecret: process.env.SHOPIFY_API_SECRET!,
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

function verifyHmac(searchParams: URLSearchParams, secret: string) {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const sorted = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const message = sorted.map(([key, value]) => `${key}=${value}`).join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  try {
    return (
      Buffer.byteLength(digest) === Buffer.byteLength(hmac) &&
      crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"))
    );
  } catch {
    return false;
  }
}

async function exchangeCodeForToken(shop: string, code: string, env: ReturnType<typeof getEnv>) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.apiKey,
      client_secret: env.apiSecret,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("No access_token returned from Shopify");
  }
  return data.access_token;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const state = params.get("state");

  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Missing or invalid shop" },
      { status: 400 },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
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

  if (!verifyHmac(params, env.apiSecret)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("shopify_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: "State mismatch" }, { status: 400 });
  }

  cookieStore.set("shopify_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });

  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(shop, code, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let shopCurrency: string | null = null;
  let shopTimezone = "UTC";
  try {
    const shopSettings = await fetchShopifyShop(shop, accessToken);
    shopCurrency = normalizeCurrencyCode(shopSettings?.currency);
    shopTimezone = normalizeShopTimezone(shopSettings?.iana_timezone);
  } catch (error) {
    logWarn("shopify_shop_settings_failed", {
      shopDomain: shop,
      error: error instanceof Error ? error.message : "Failed to fetch Shopify shop settings",
    });
  }

  await prisma.shop.upsert({
    where: { shopDomain: shop },
    update: {
      accessToken,
      installedAt: new Date(),
      ...(shopCurrency ? { currency: shopCurrency } : {}),
      timezone: shopTimezone,
    },
    create: {
      shopDomain: shop,
      accessToken,
      installedAt: new Date(),
      currency: shopCurrency ?? undefined,
      timezone: shopTimezone,
    },
  });

  const redirectUrl = `${env.appUrl}/dashboard?shop=${encodeURIComponent(shop)}`;
  return NextResponse.redirect(redirectUrl);
}
