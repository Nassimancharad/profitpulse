import { NextResponse } from "next/server";
import { clearAuthorizedShopsCookie, getAuthorizedSessionFromCookie } from "@/lib/auth";
import { revokeAppSession } from "@/lib/appSessions";

function buildRedirectUrl(request: Request) {
  const url = new URL(request.url);
  const redirectUrl = new URL("/login", url.origin);
  redirectUrl.searchParams.set("logged_out", "1");
  return redirectUrl;
}

export async function GET(request: Request) {
  const session = await getAuthorizedSessionFromCookie();
  if (session.kind === "standalone" && session.actorUserId && session.sessionId) {
    await revokeAppSession(session.sessionId, session.actorUserId);
  }
  await clearAuthorizedShopsCookie();
  return NextResponse.redirect(buildRedirectUrl(request));
}

export async function POST(request: Request) {
  const session = await getAuthorizedSessionFromCookie();
  if (session.kind === "standalone" && session.actorUserId && session.sessionId) {
    await revokeAppSession(session.sessionId, session.actorUserId);
  }
  await clearAuthorizedShopsCookie();
  return NextResponse.redirect(buildRedirectUrl(request));
}
