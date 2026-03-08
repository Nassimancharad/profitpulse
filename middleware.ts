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

function applyEmbeddedFramePolicy(response: NextResponse) {
  response.headers.delete("x-frame-options");
  response.headers.delete("X-Frame-Options");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com;",
  );
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const policy = buildCookiePolicy(request);
  const host = request.nextUrl.searchParams.get(EMBEDDED_APP_HOST_PARAM);
  const embedded = request.nextUrl.searchParams.get(EMBEDDED_APP_FLAG_PARAM);
  const accept = request.headers.get("accept") ?? "";
  const isDocumentRequest =
    request.method === "GET" &&
    !request.nextUrl.pathname.startsWith("/api/") &&
    accept.includes("text/html");

  if (host) {
    response.cookies.set(EMBEDDED_APP_HOST_COOKIE, host, policy);
  }

  if (embedded === "1") {
    response.cookies.set(EMBEDDED_APP_FLAG_COOKIE, "1", policy);
  } else if (embedded === "0") {
    response.cookies.delete(EMBEDDED_APP_FLAG_COOKIE);
    response.cookies.delete(EMBEDDED_APP_HOST_COOKIE);
  }

  if (isDocumentRequest) {
    applyEmbeddedFramePolicy(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon.svg).*)"],
};
