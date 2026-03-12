import { NextResponse } from "next/server";
import { consumeMagicLinkToken } from "@/lib/magicLinks";
import { enforceMagicLinkVerifyRateLimit } from "@/lib/magicLinkRateLimit";

type MagicLinkVerifyDeps = {
  enforceRateLimit: typeof enforceMagicLinkVerifyRateLimit;
  consumeToken: typeof consumeMagicLinkToken;
};

export async function handleMagicLinkVerify(
  request: Request,
  deps: MagicLinkVerifyDeps,
) {
  const url = new URL(request.url);
  const rateLimit = await deps.enforceRateLimit({
    ipAddress: request.headers.get("x-forwarded-for"),
  });

  if (!rateLimit.ok) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "rate_limited");
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("retry-after", String(rateLimit.retryAfterSeconds));
    return response;
  }

  const token = url.searchParams.get("token")?.trim() ?? "";
  const result = await deps.consumeToken({
    token,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", result.code);
    return NextResponse.redirect(loginUrl);
  }

  const dashboardUrl = new URL("/dashboard", url.origin);
  dashboardUrl.searchParams.set("login", "magic_link_success");
  return NextResponse.redirect(dashboardUrl);
}

export async function GET(request: Request) {
  return handleMagicLinkVerify(request, {
    enforceRateLimit: enforceMagicLinkVerifyRateLimit,
    consumeToken: consumeMagicLinkToken,
  });
}
