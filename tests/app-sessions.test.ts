import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listActiveStandaloneSessions,
  revokeAllAppSessions,
  revokeAppSession,
  revokeOtherAppSessions,
} from "../src/lib/appSessions";

test("revokeAppSession scopes revocation to the current user and session", async () => {
  let received: unknown = null;
  const db = {
    appSession: {
      async updateMany(args: unknown) {
        received = args;
        return { count: 1 };
      },
    },
  } as any;

  const result = await revokeAppSession("sess_1", "user_1", db);
  assert.equal(result, true);
  assert.deepEqual(received, {
    where: {
      id: "sess_1",
      userId: "user_1",
      revokedAt: null,
    },
    data: {
      revokedAt: received && (received as any).data.revokedAt,
    },
  });
});

test("revokeOtherAppSessions excludes the current session", async () => {
  let received: unknown = null;
  const db = {
    appSession: {
      async updateMany(args: unknown) {
        received = args;
        return { count: 2 };
      },
    },
  } as any;

  const count = await revokeOtherAppSessions("sess_current", "user_1", db);
  assert.equal(count, 2);
  assert.equal((received as any).where.id.not, "sess_current");
});

test("listActiveStandaloneSessions requests standalone sessions ordered by activity", async () => {
  let received: unknown = null;
  const db = {
    appSession: {
      async findMany(args: unknown) {
        received = args;
        return [];
      },
    },
  } as any;

  await listActiveStandaloneSessions("user_1", db);
  assert.equal((received as any).where.kind, "standalone");
  assert.equal((received as any).where.revokedAt, null);
  assert.ok((received as any).where.expiresAt.gt instanceof Date);
  assert.deepEqual((received as any).orderBy, [{ lastSeenAt: "desc" }, { createdAt: "desc" }]);
});

test("revokeAllAppSessions revokes all active sessions for a user", async () => {
  const db = {
    appSession: {
      async updateMany() {
        return { count: 3 };
      },
    },
  } as any;

  const count = await revokeAllAppSessions("user_1", db);
  assert.equal(count, 3);
});
