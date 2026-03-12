import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignedSessionValue, verifySignedSessionValue } from "../src/lib/authCookie";

test("verifySignedSessionValue returns parsed standalone payload", () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    kind: "standalone" as const,
    provider: "email" as const,
    sessionId: "sess_123",
    shops: ["demo.myshopify.com"],
    roles: { "demo.myshopify.com": "VIEWER" as const },
    sub: "user@example.com",
    userId: "user_123",
    iat: now,
    exp: now + 60,
  };

  const value = createSignedSessionValue(payload, "secret");
  const result = verifySignedSessionValue(value, "secret");

  assert.equal(result?.kind, "standalone");
  assert.equal(result?.sessionId, "sess_123");
  assert.deepEqual(result?.shops, ["demo.myshopify.com"]);
});

test("verifySignedSessionValue rejects expired payloads", () => {
  const now = Math.floor(Date.now() / 1000);
  const value = createSignedSessionValue(
    {
      kind: "shopify" as const,
      provider: "shopify" as const,
      shops: ["demo.myshopify.com"],
      iat: now - 120,
      exp: now - 60,
    },
    "secret",
  );

  assert.equal(verifySignedSessionValue(value, "secret"), null);
});
