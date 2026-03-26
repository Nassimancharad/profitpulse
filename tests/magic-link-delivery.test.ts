import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverMagicLink, resolveMagicLinkDeliveryMode } from "../src/lib/magicLinkDelivery";

test("magic link delivery defaults to preview outside production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.MAGIC_LINK_DELIVERY_MODE;
  process.env.NODE_ENV = "development";
  delete process.env.MAGIC_LINK_DELIVERY_MODE;

  try {
    assert.equal(resolveMagicLinkDeliveryMode(), "preview");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMode === undefined) {
      delete process.env.MAGIC_LINK_DELIVERY_MODE;
    } else {
      process.env.MAGIC_LINK_DELIVERY_MODE = originalMode;
    }
  }
});

test("magic link delivery defaults to disabled in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.MAGIC_LINK_DELIVERY_MODE;
  process.env.NODE_ENV = "production";
  delete process.env.MAGIC_LINK_DELIVERY_MODE;

  try {
    assert.equal(resolveMagicLinkDeliveryMode(), "disabled");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMode === undefined) {
      delete process.env.MAGIC_LINK_DELIVERY_MODE;
    } else {
      process.env.MAGIC_LINK_DELIVERY_MODE = originalMode;
    }
  }
});

test("magic link delivery can be forced to preview in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMode = process.env.MAGIC_LINK_DELIVERY_MODE;
  process.env.NODE_ENV = "production";
  process.env.MAGIC_LINK_DELIVERY_MODE = "preview";

  try {
    const result = await deliverMagicLink({
      email: "user@example.com",
      magicLinkUrl: "https://example.com/auth/verify?token=abc",
      expiresAt: new Date("2026-03-26T10:00:00.000Z"),
    });
    assert.equal(result.mode, "preview");
    assert.equal(result.previewUrl, "https://example.com/auth/verify?token=abc");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMode === undefined) {
      delete process.env.MAGIC_LINK_DELIVERY_MODE;
    } else {
      process.env.MAGIC_LINK_DELIVERY_MODE = originalMode;
    }
  }
});
