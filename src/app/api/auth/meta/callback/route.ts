import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchMetaAdAccounts,
} from "@/lib/meta";

const STATE_COOKIE = "meta_oauth_state";
const SHOP_COOKIE = "meta_oauth_shop";

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

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const shopDomain = cookieStore.get(SHOP_COOKIE)?.value ?? url.searchParams.get("shop");

  if (!expectedState || !state || expectedState !== state) {
    return NextResponse.json({ error: "Invalid or missing state" }, { status: 400 });
  }

  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop context" }, { status: 400 });
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
    console.warn("Meta long-lived token exchange failed:", err);
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

  const response = NextResponse.json({
    ok: true,
    shop: shopDomain,
    connectedAccounts: adAccounts.map((acc) => ({ id: acc.id, name: acc.name ?? null })),
  });

  // Clear state cookies now that flow is complete.
  response.cookies.set(STATE_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });
  response.cookies.set(SHOP_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });

  return response;
}
