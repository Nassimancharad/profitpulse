import assert from "node:assert/strict";
import { test } from "node:test";
import { NextResponse } from "next/server";
import { handleSessionRevoke } from "../src/app/api/auth/sessions/revoke/route";

function buildRequest(form: Record<string, string>, referer?: string) {
  const body = new URLSearchParams(form);
  return new Request("https://app.example.com/api/auth/sessions/revoke", {
    method: "POST",
    headers: referer ? { referer } : undefined,
    body,
  });
}

test("handleSessionRevoke returns auth response when unauthenticated", async () => {
  const response = await handleSessionRevoke(buildRequest({ action: "revoke_others" }), {
    authenticate: async () => ({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }),
    revokeOne: async () => false,
    revokeOthers: async () => 0,
    revokeAll: async () => 0,
    clearCookie: async () => {},
  });

  assert.equal(response.status, 401);
});

test("handleSessionRevoke revokes other devices and redirects back", async () => {
  let called = false;
  const response = await handleSessionRevoke(
    buildRequest({ action: "revoke_others" }, "https://app.example.com/preferences?shop=demo.myshopify.com"),
    {
      authenticate: async () => ({
        ok: true as const,
        kind: "standalone" as const,
        provider: "email" as const,
        sessionId: "sess_current",
        actorUserId: "user_1",
        actorExternalId: "user@example.com",
        shops: ["demo.myshopify.com"],
        rolesByShop: { "demo.myshopify.com": "VIEWER" as const },
        authorizedShops: new Set(["demo.myshopify.com"]),
        shopRoles: new Map([["demo.myshopify.com", "VIEWER" as const]]),
        source: "cookie" as const,
      }),
      revokeOne: async () => false,
      revokeOthers: async () => {
        called = true;
        return 2;
      },
      revokeAll: async () => 0,
      clearCookie: async () => {},
    },
  );

  assert.equal(called, true);
  assert.equal(
    response.headers.get("location"),
    "https://app.example.com/preferences?shop=demo.myshopify.com&sessions=others_revoked",
  );
});

test("handleSessionRevoke clears cookie when revoking current session", async () => {
  let cleared = false;
  const response = await handleSessionRevoke(buildRequest({ action: "revoke_current" }), {
    authenticate: async () => ({
      ok: true as const,
      kind: "standalone" as const,
      provider: "email" as const,
      sessionId: "sess_current",
      actorUserId: "user_1",
      actorExternalId: "user@example.com",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": "VIEWER" as const },
      authorizedShops: new Set(["demo.myshopify.com"]),
      shopRoles: new Map([["demo.myshopify.com", "VIEWER" as const]]),
      source: "cookie" as const,
    }),
    revokeOne: async () => true,
    revokeOthers: async () => 0,
    revokeAll: async () => 0,
    clearCookie: async () => {
      cleared = true;
    },
  });

  assert.equal(cleared, true);
  assert.equal(response.headers.get("location"), "https://app.example.com/login?logged_out=1");
});
