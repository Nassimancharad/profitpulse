import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildMetaAuthUrl } from "@/lib/meta";

const STATE_COOKIE = "meta_oauth_state";
const SHOP_COOKIE = "meta_oauth_shop";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop query parameter" }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");

  let authUrl: string;
  try {
    authUrl = buildMetaAuthUrl(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build Meta OAuth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  response.cookies.set(SHOP_COOKIE, shop, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
