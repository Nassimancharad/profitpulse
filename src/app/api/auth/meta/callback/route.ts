import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchMetaAdAccounts,
} from "@/lib/meta";
import { requireFeatureForShop } from "@/lib/planGate";
import { logWarn } from "@/observability";

function parseState(state: string | null) {
  if (!state) return null;
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const [shop, nonce, signature] = parts;
  return { shop, nonce, signature };
}

async function verifyState(state: string | null) {
  if (!state) return null;
  const parsed = parseState(state);
  if (!parsed) return null;
  const secret = process.env.META_APP_SECRET;
  if (!secret) return null;
  try {
    const raw = `${parsed.shop}:${parsed.nonce}`;
    // lazy-require crypto to avoid edge runtime incompat
    const nodeCrypto = await import("node:crypto");
    const expected = nodeCrypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (expected !== parsed.signature) return null;
    return parsed.shop;
  } catch (err) {
    logWarn("meta_state_verification_failed", {
      error: err instanceof Error ? err.message : "unknown_error",
    });
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      { error: `Meta OAuth error: ${error}`, description: errorDescription ?? null },
      { status: 400 },
    );
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const shopDomain = await verifyState(state);
  if (!shopDomain) {
    return NextResponse.json({ error: "Invalid or missing state" }, { status: 400 });
  }

  const planGuard = await requireFeatureForShop({
    shopDomain,
    feature: "META_CONNECTIONS",
  });
  if (planGuard) {
    let reason = "plan_upgrade_required";
    try {
      const payload = (await planGuard.clone().json()) as { code?: string };
      if (payload?.code === "PLAN_INACTIVE") {
        reason = "plan_inactive";
      } else if (planGuard.status === 404) {
        reason = "not_found";
      }
    } catch {
      // keep default reason
    }

    const appBase = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
    const params = new URLSearchParams({ meta: reason, shop: shopDomain });
    return NextResponse.redirect(`${appBase}/connections?${params.toString()}`);
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  let shortLivedToken: string;
  try {
    shortLivedToken = await exchangeCodeForShortLivedToken(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let accessToken = shortLivedToken;
  try {
    accessToken = await exchangeForLongLivedToken(shortLivedToken);
  } catch (err) {
    // If long-lived exchange fails, continue with short-lived token.
    logWarn("meta_long_lived_exchange_failed", {
      error: err instanceof Error ? err.message : "unknown_error",
    });
  }

  let adAccounts: { id: string; name?: string | null }[] = [];
  try {
    adAccounts = await fetchMetaAdAccounts(accessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch ad accounts";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  for (const account of adAccounts) {
    await prisma.metaAdAccount.upsert({
      where: {
        shopId_adAccountId: {
          shopId: shop.id,
          adAccountId: account.id,
        },
      },
      update: {
        name: account.name ?? null,
        accessToken,
      },
      create: {
        shopId: shop.id,
        adAccountId: account.id,
        name: account.name ?? null,
        accessToken,
      },
    });
  }

  const origin = new URL(request.url).origin;
  // Prefer configured app URL to avoid stale localhost/tunnel redirects.
  const appBase =
    process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") ||
    origin;
  const redirectUrl = `${appBase}/connections?meta=connected`;
  return NextResponse.redirect(redirectUrl);
}
