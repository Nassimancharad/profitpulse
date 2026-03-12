import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveStandaloneCookieSession } from "../src/lib/authStandalone";

test("resolveStandaloneCookieSession returns session data for active app session", async () => {
  const updates: unknown[] = [];
  const db = {
    appSession: {
      async findUnique() {
        return {
          id: "sess_1",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          user: {
            id: "user_1",
            externalId: "user@example.com",
            memberships: [
              {
                role: "EDITOR",
                shop: { shopDomain: "demo.myshopify.com" },
              },
            ],
          },
        };
      },
      async update(args: unknown) {
        updates.push(args);
        return {};
      },
    },
  } as any;

  const result = await resolveStandaloneCookieSession(
    {
      kind: "standalone",
      provider: "email",
      sessionId: "sess_1",
      shops: ["demo.myshopify.com"],
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    db,
  );

  assert.equal(result?.actorUserId, "user_1");
  assert.equal(result?.sessionId, "sess_1");
  assert.deepEqual(result?.shops, ["demo.myshopify.com"]);
  assert.equal(updates.length, 1);
});

test("resolveStandaloneCookieSession returns null for revoked sessions", async () => {
  const db = {
    appSession: {
      async findUnique() {
        return {
          id: "sess_1",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
          user: {
            id: "user_1",
            externalId: "user@example.com",
            memberships: [],
          },
        };
      },
    },
  } as any;

  const result = await resolveStandaloneCookieSession(
    {
      kind: "standalone",
      provider: "email",
      sessionId: "sess_1",
      shops: ["demo.myshopify.com"],
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    db,
  );

  assert.equal(result, null);
});
