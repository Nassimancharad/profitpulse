import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildMetaAuthUrl } from "@/lib/meta";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop query parameter" }, { status: 400 });
  }

  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing META_APP_SECRET" }, { status: 500 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const raw = `${shop}:${nonce}`;
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const state = `${shop}:${nonce}:${signature}`;

  let authUrl: string;
  try {
    authUrl = buildMetaAuthUrl(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build Meta OAuth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.redirect(authUrl);
}
