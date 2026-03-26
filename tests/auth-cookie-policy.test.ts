import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSessionCookiePolicyFromEnv } from "../src/lib/auth";

test("cookie policy uses lax + non-secure for localhost http", () => {
  const policy = resolveSessionCookiePolicyFromEnv({
    appUrl: "http://localhost:3000",
    nodeEnv: "development",
  });
  assert.equal(policy.sameSite, "lax");
  assert.equal(policy.secure, false);
  assert.equal(policy.partitioned, false);
});

test("cookie policy uses none + secure for production https", () => {
  const policy = resolveSessionCookiePolicyFromEnv({
    appUrl: "https://profitpulse.app",
    nodeEnv: "production",
  });
  assert.equal(policy.sameSite, "none");
  assert.equal(policy.secure, true);
  assert.equal(policy.partitioned, true);
});
