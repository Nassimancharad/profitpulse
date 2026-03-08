import { NextResponse } from "next/server";
import { establishSessionFromToken } from "@/lib/auth";
import { verifyShopifySessionToken } from "@/lib/shopifySession";
import { logWarn } from "@/observability";

function buildAppRedirectUrl(requestUrl: URL, pathname: string, input: {
  shop?: string | null;
  host?: string | null;
  embedded?: string | null;
  locale?: string | null;
  auth?: string | null;
  authError?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.shop) params.set("shop", input.shop);
  if (input.host) params.set("host", input.host);
  if (input.embedded) params.set("embedded", input.embedded);
  if (input.locale) params.set("locale", input.locale);
  if (input.auth) params.set("auth", input.auth);
  if (input.authError) params.set("auth_error", input.authError);

  const target = new URL(pathname, requestUrl.origin);
  const query = params.toString();
  if (query) {
    target.search = query;
  }
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idToken = url.searchParams.get("id_token");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");
  const locale = url.searchParams.get("locale");
  const requestedShop = url.searchParams.get("shop");

  if (!idToken) {
    const fallback = buildAppRedirectUrl(url, "/connections", {
      shop: requestedShop,
      host,
      embedded,
      locale,
      auth: "required",
      authError: "missing_id_token",
    });
    return NextResponse.redirect(fallback);
  }

  try {
    const { shop, payload } = verifyShopifySessionToken(idToken);
    await establishSessionFromToken(shop, payload as unknown as Record<string, unknown>);

    const redirectUrl = buildAppRedirectUrl(url, "/dashboard", {
      shop,
      host,
      embedded,
      locale,
    });
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown_error";
    const normalizedError =
      errorMessage === "Audience mismatch"
        ? "audience_mismatch"
        : errorMessage === "Invalid signature"
          ? "invalid_signature"
          : errorMessage === "Token expired"
            ? "token_expired"
            : errorMessage === "Token not yet valid"
              ? "token_not_yet_valid"
              : /Missing required env vars/i.test(errorMessage)
                ? "server_env_missing"
                : "session_bootstrap_failed";

    logWarn("embedded_entry_session_bootstrap_failed", {
      shop: requestedShop,
      error: errorMessage,
      code: normalizedError,
    });

    const fallback = buildAppRedirectUrl(url, "/connections", {
      shop: requestedShop,
      host,
      embedded,
      locale,
      auth: "required",
      authError: normalizedError,
    });
    return NextResponse.redirect(fallback);
  }
}
