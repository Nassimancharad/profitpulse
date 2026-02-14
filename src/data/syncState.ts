import crypto from "node:crypto";
import { SyncResource, SyncStatus, type SyncState } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logWarn } from "@/observability/logger";

const DEFAULT_LOCK_TTL_MS = 20 * 60 * 1000;

function buildLockWindow(now: Date, ttlMs: number) {
  return {
    lockedAt: now,
    lockExpiresAt: new Date(now.getTime() + ttlMs),
  };
}

export async function acquireSyncLock(params: {
  shopId: string;
  resource: SyncResource;
  lockTtlMs?: number;
}): Promise<
  | { ok: true; state: SyncState }
  | { ok: false; status: 409; state: SyncState | null }
> {
  const now = new Date();
  const ttlMs = params.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const lockWindow = buildLockWindow(now, ttlMs);

  const acquired = await prisma.$queryRaw<SyncState[]>`
    WITH inserted AS (
      INSERT INTO "SyncState" (
        "id",
        "shopId",
        "resource",
        "status",
        "lastStartedAt",
        "lockedAt",
        "lockExpiresAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${params.shopId},
        CAST(${params.resource} AS "SyncResource"),
        CAST(${SyncStatus.RUNNING} AS "SyncStatus"),
        ${now},
        ${lockWindow.lockedAt},
        ${lockWindow.lockExpiresAt},
        ${now},
        ${now}
      )
      ON CONFLICT ("shopId", "resource") DO NOTHING
      RETURNING *
    ),
    updated AS (
      UPDATE "SyncState"
      SET
        "status" = CAST(${SyncStatus.RUNNING} AS "SyncStatus"),
        "lastStartedAt" = ${now},
        "error" = NULL,
        "lockedAt" = ${lockWindow.lockedAt},
        "lockExpiresAt" = ${lockWindow.lockExpiresAt},
        "updatedAt" = ${now}
      WHERE "shopId" = ${params.shopId}
        AND "resource" = CAST(${params.resource} AS "SyncResource")
        AND (
          "status" <> CAST(${SyncStatus.RUNNING} AS "SyncStatus")
          OR "lockExpiresAt" IS NULL
          OR "lockExpiresAt" < ${now}
        )
      RETURNING *
    )
    SELECT * FROM inserted
    UNION ALL
    SELECT * FROM updated
    LIMIT 1;
  `;

  if (acquired.length > 0) {
    return { ok: true, state: acquired[0] } as const;
  }

  const existing = await prisma.syncState.findUnique({
    where: {
      shopId_resource: {
        shopId: params.shopId,
        resource: params.resource,
      },
    },
  });

  if (!existing) {
    logWarn("sync_state_missing_after_lock", {
      shopId: params.shopId,
      resource: params.resource,
    });
  }

  return { ok: false, status: 409, state: existing } as const;
}

export async function recordSyncSuccess(params: {
  shopId: string;
  resource: SyncResource;
  syncedAt?: Date;
}) {
  const now = new Date();
  return prisma.syncState.update({
    where: {
      shopId_resource: {
        shopId: params.shopId,
        resource: params.resource,
      },
    },
    data: {
      status: SyncStatus.OK,
      lastSyncedAt: params.syncedAt ?? now,
      lastFinishedAt: now,
      lockedAt: null,
      lockExpiresAt: null,
      error: null,
    },
  });
}

export async function recordSyncError(params: {
  shopId: string;
  resource: SyncResource;
  error: string;
}) {
  const now = new Date();
  return prisma.syncState.update({
    where: {
      shopId_resource: {
        shopId: params.shopId,
        resource: params.resource,
      },
    },
    data: {
      status: SyncStatus.ERROR,
      lastFinishedAt: now,
      lockedAt: null,
      lockExpiresAt: null,
      error: params.error.slice(0, 2000),
    },
  });
}
