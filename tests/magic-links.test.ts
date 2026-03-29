import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMagicLinkUrl,
  createMagicLinkToken,
  defaultMagicLinkExpiry,
  hashMagicLinkToken,
  resolveMagicLinkUser,
} from "../src/lib/magicLinks";
import { resolveUnauthenticatedAppPageDestination } from "../src/lib/auth";

test("createMagicLinkToken returns a non-trivial random token", () => {
  const token = createMagicLinkToken();
  assert.ok(token.length >= 32);
});

test("hashMagicLinkToken is deterministic", () => {
  assert.equal(hashMagicLinkToken("abc"), hashMagicLinkToken("abc"));
});

test("defaultMagicLinkExpiry is roughly twenty minutes ahead", () => {
  const now = new Date("2026-03-12T10:00:00.000Z");
  const expiresAt = defaultMagicLinkExpiry(now);
  assert.equal(expiresAt.toISOString(), "2026-03-12T10:20:00.000Z");
});

test("buildMagicLinkUrl uses request origin when app url is missing", () => {
  const originalUrl = process.env.SHOPIFY_APP_URL;
  delete process.env.SHOPIFY_APP_URL;

  try {
    const url = buildMagicLinkUrl("token-123", "http://localhost:3000");
    assert.equal(url, "http://localhost:3000/auth/verify?token=token-123");
  } finally {
    if (originalUrl === undefined) {
      delete process.env.SHOPIFY_APP_URL;
    } else {
      process.env.SHOPIFY_APP_URL = originalUrl;
    }
  }
});

test("resolveUnauthenticatedAppPageDestination keeps embedded requests on connections", () => {
  assert.equal(
    resolveUnauthenticatedAppPageDestination({
      embedded: "1",
      host: "shopify-host",
      shop: "demo.myshopify.com",
    }),
    "/connections?shop=demo.myshopify.com&host=shopify-host&embedded=1",
  );
  assert.equal(resolveUnauthenticatedAppPageDestination({ embedded: null, host: null }), "/login");
});

test("resolveMagicLinkUser provisions an email login from existing shopify memberships", async () => {
  const upsertCalls: Array<unknown> = [];
  const membershipUpserts: Array<unknown> = [];

  const tx = {
    appUser: {
      async findUnique() {
        return {
          id: "email_user_1",
          email: "user@example.com",
          externalId: "user@example.com",
          displayName: "User Example",
          memberships: [
            {
              shopId: "shop_1",
              role: "ADMIN",
              shop: { shopDomain: "demo.myshopify.com" },
            },
          ],
        };
      },
      async upsert(args: unknown) {
        upsertCalls.push(args);
        return { id: "email_user_1" };
      },
      async findMany() {
        return [];
      },
    },
    shopMembership: {
      async upsert(args: unknown) {
        membershipUpserts.push(args);
        return {};
      },
    },
  };

  const db = {
    appUser: {
      async findUnique() {
        return null;
      },
      async findMany() {
        return [
          {
            id: "shopify_user_1",
            email: "user@example.com",
            externalId: "shopify-sub",
            displayName: "User Example",
            memberships: [
              {
                shopId: "shop_1",
                role: "ADMIN",
                shop: { shopDomain: "demo.myshopify.com" },
              },
            ],
          },
        ];
      },
    },
    async $transaction(callback: (client: typeof tx) => Promise<unknown>) {
      return callback(tx as typeof tx);
    },
  } as any;

  const user = await resolveMagicLinkUser("user@example.com", db);

  assert.equal(user?.id, "email_user_1");
  assert.equal(upsertCalls.length, 1);
  assert.equal(membershipUpserts.length, 1);
  assert.equal((membershipUpserts[0] as any).create.role, "ADMIN");
});
