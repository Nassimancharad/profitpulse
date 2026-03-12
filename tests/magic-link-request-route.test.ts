import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMagicLinkRequest } from "../src/app/api/auth/magic-link/request/route";

test("handleMagicLinkRequest returns retry-after when rate limited", async () => {
  const request = new Request("https://app.example.com/api/auth/magic-link/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.1",
    },
    body: JSON.stringify({ email: "user@example.com" }),
  });

  const response = await handleMagicLinkRequest(request, {
    enforceRateLimit: async () => ({
      ok: false,
      status: 429,
      error: "Too many magic link requests. Try again later.",
      retryAfterSeconds: 900,
    }),
    createLogin: async () => {
      throw new Error("should not be called");
    },
    deliver: async () => {
      throw new Error("should not be called");
    },
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
});

test("handleMagicLinkRequest returns preview url on success", async () => {
  const request = new Request("https://app.example.com/api/auth/magic-link/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.1",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ email: "user@example.com" }),
  });

  const response = await handleMagicLinkRequest(request, {
    enforceRateLimit: async () => ({ ok: true }),
    createLogin: async () => ({
      ok: true,
      email: "user@example.com",
      loginLink: "https://app.example.com/auth/verify?token=abc",
      expiresAt: new Date(),
    }),
    deliver: async () => ({
      mode: "preview",
      previewUrl: "https://app.example.com/auth/verify?token=abc",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.previewUrl, "https://app.example.com/auth/verify?token=abc");
});
