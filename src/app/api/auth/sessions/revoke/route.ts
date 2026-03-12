import { NextResponse } from "next/server";
import { revokeAllAppSessions, revokeAppSession, revokeOtherAppSessions } from "@/lib/appSessions";
import { authenticateApiRequest, clearAuthorizedShopsCookie } from "@/lib/auth";

function buildRedirectUrl(request: Request, status: string) {
  const referer = request.headers.get("referer");
  const base = referer ? new URL(referer) : new URL("/preferences", request.url);
  base.searchParams.set("sessions", status);
  return base;
}

type SessionRevokeDeps = {
  authenticate: typeof authenticateApiRequest;
  revokeOne: typeof revokeAppSession;
  revokeOthers: typeof revokeOtherAppSessions;
  revokeAll: typeof revokeAllAppSessions;
  clearCookie: typeof clearAuthorizedShopsCookie;
};

export async function handleSessionRevoke(
  request: Request,
  deps: SessionRevokeDeps,
) {
  const auth = await deps.authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.kind !== "standalone" || !auth.actorUserId || !auth.sessionId) {
    return NextResponse.json({ error: "Standalone session required." }, { status: 400 });
  }

  const formData = await request.formData();
  const rawAction = formData.get("action");
  const rawSessionId = formData.get("sessionId");
  const action = typeof rawAction === "string" ? rawAction : "";
  const sessionId = typeof rawSessionId === "string" ? rawSessionId : "";

  if (action === "revoke_current") {
    await deps.revokeOne(auth.sessionId, auth.actorUserId);
    await deps.clearCookie();
    return NextResponse.redirect(new URL("/login?logged_out=1", request.url));
  }

  if (action === "revoke_others") {
    await deps.revokeOthers(auth.sessionId, auth.actorUserId);
    return NextResponse.redirect(buildRedirectUrl(request, "others_revoked"));
  }

  if (action === "revoke_all") {
    await deps.revokeAll(auth.actorUserId);
    await deps.clearCookie();
    return NextResponse.redirect(new URL("/login?logged_out=1", request.url));
  }

  if (action === "revoke_one" && sessionId) {
    await deps.revokeOne(sessionId, auth.actorUserId);
    if (sessionId === auth.sessionId) {
      await deps.clearCookie();
      return NextResponse.redirect(new URL("/login?logged_out=1", request.url));
    }
    return NextResponse.redirect(buildRedirectUrl(request, "session_revoked"));
  }

  return NextResponse.json({ error: "Invalid revoke action." }, { status: 400 });
}

export async function POST(request: Request) {
  return handleSessionRevoke(request, {
    authenticate: authenticateApiRequest,
    revokeOne: revokeAppSession,
    revokeOthers: revokeOtherAppSessions,
    revokeAll: revokeAllAppSessions,
    clearCookie: clearAuthorizedShopsCookie,
  });
}
