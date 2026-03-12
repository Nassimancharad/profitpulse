import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeRateLimitEmailKey,
  normalizeRateLimitIpKey,
} from "../src/lib/magicLinkRateLimit";

test("normalizeRateLimitEmailKey is stable for the same email", () => {
  assert.equal(
    normalizeRateLimitEmailKey("Test@Example.com"),
    normalizeRateLimitEmailKey("test@example.com"),
  );
});

test("normalizeRateLimitIpKey keeps only the first forwarded IP", () => {
  const keyA = normalizeRateLimitIpKey("203.0.113.1, 10.0.0.2");
  const keyB = normalizeRateLimitIpKey("203.0.113.1");
  assert.equal(keyA, keyB);
});

test("normalizeRateLimitIpKey returns empty key when IP is missing", () => {
  assert.equal(normalizeRateLimitIpKey(null), "");
});
