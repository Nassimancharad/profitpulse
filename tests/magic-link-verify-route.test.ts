import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMagicLinkVerify } from "../src/app/auth/verify/route";

test("handleMagicLinkVerify redirects to login when rate limited", async () => {
  const request = new Request("https://app.example.com/auth/verify?token=abc", {
    headers: {
      "x-forwarded-for": "203.0.113.1",
    },
  });

  const response = await handleMagicLinkVerify(request, {
    enforceRateLimit: async () => ({
      ok: false,
      status: 429,
      error: "Too many login attempts. Try again later.",
      retryAfterSeconds: 900,
    }),
    consumeToken: async () => {
      throw new Error("should not be called");
    },
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("retry-after"), "900");
  assert.equal(response.headers.get("location"), "https://app.example.com/login?error=rate_limited");
});

test("handleMagicLinkVerify redirects to login on invalid token", async () => {
  const request = new Request("https://app.example.com/auth/verify?token=abc");

  const response = await handleMagicLinkVerify(request, {
    enforceRateLimit: async () => ({ ok: true }),
    consumeToken: async () => ({
      ok: false,
      status: 404,
      error: "invalid",
      code: "invalid",
    }),
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://app.example.com/login?error=invalid");
});

test("handleMagicLinkVerify redirects to dashboard on success", async () => {
  const request = new Request("https://app.example.com/auth/verify?token=abc", {
    headers: {
      "x-forwarded-for": "203.0.113.1",
      "user-agent": "Mozilla/5.0",
    },
  });

  const response = await handleMagicLinkVerify(request, {
    enforceRateLimit: async () => ({ ok: true }),
    consumeToken: async () => ({
      ok: true,
      userId: "user_1",
      email: "user@example.com",
      shops: ["demo.myshopify.com"],
      rolesByShop: { "demo.myshopify.com": "VIEWER" as const },
    }),
  });

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://app.example.com/dashboard?login=magic_link_success");
});
