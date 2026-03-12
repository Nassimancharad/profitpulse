import { test } from "node:test";
import assert from "node:assert/strict";
import { ShopRole } from "@prisma/client";
import {
  buildInviteUrl,
  createInviteToken,
  defaultInviteExpiry,
  hashInviteToken,
  isValidInviteRole,
  normalizeInviteEmail,
} from "../src/lib/teamInvites";

test("normalizeInviteEmail trims and lowercases", () => {
  assert.equal(normalizeInviteEmail("  HELLO@Example.COM "), "hello@example.com");
});

test("isValidInviteRole accepts admin, editor, and viewer", () => {
  assert.equal(isValidInviteRole(ShopRole.ADMIN), true);
  assert.equal(isValidInviteRole(ShopRole.EDITOR), true);
  assert.equal(isValidInviteRole(ShopRole.VIEWER), true);
  assert.equal(isValidInviteRole("OWNER"), false);
});

test("hashInviteToken is deterministic for the same token", () => {
  const token = createInviteToken();
  assert.equal(hashInviteToken(token), hashInviteToken(token));
});

test("defaultInviteExpiry is seven days ahead", () => {
  const now = new Date("2026-03-12T10:00:00.000Z");
  const expiresAt = defaultInviteExpiry(now);
  assert.equal(expiresAt.toISOString(), "2026-03-19T10:00:00.000Z");
});

test("buildInviteUrl uses app url when configured", () => {
  const previous = process.env.SHOPIFY_APP_URL;
  process.env.SHOPIFY_APP_URL = "https://profitpulse.app/";

  try {
    assert.equal(buildInviteUrl("abc123"), "https://profitpulse.app/invites/accept?token=abc123");
  } finally {
    if (previous === undefined) {
      delete process.env.SHOPIFY_APP_URL;
    } else {
      process.env.SHOPIFY_APP_URL = previous;
    }
  }
});
