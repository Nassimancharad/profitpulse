import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  EMBEDDED_APP_FLAG_COOKIE,
  EMBEDDED_APP_FLAG_PARAM,
  EMBEDDED_APP_HOST_COOKIE,
  EMBEDDED_APP_HOST_PARAM,
} from "@/lib/embeddedAppContext";

function buildCookiePolicy(request: NextRequest) {
  const secure = request.nextUrl.protocol === "https:";
  return {
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const policy = buildCookiePolicy(request);
  const host = request.nextUrl.searchParams.get(EMBEDDED_APP_HOST_PARAM);
  const embedded = request.nextUrl.searchParams.get(EMBEDDED_APP_FLAG_PARAM);

  if (host) {
    response.cookies.set(EMBEDDED_APP_HOST_COOKIE, host, policy);
  }

  if (embedded === "1") {
    response.cookies.set(EMBEDDED_APP_FLAG_COOKIE, "1", policy);
  } else if (embedded === "0") {
    response.cookies.delete(EMBEDDED_APP_FLAG_COOKIE);
    response.cookies.delete(EMBEDDED_APP_HOST_COOKIE);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon.svg).*)"],
};
