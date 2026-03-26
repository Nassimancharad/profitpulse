import prisma from "@/lib/prisma";

type DbClient = typeof prisma;

export async function revokeAppSession(sessionId: string, userId: string, db: DbClient = prisma) {
  const result = await db.appSession.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

export async function revokeOtherAppSessions(currentSessionId: string, userId: string, db: DbClient = prisma) {
  const result = await db.appSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      id: {
        not: currentSessionId,
      },
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}

export async function revokeAllAppSessions(userId: string, db: DbClient = prisma) {
  const result = await db.appSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count;
}

export async function listActiveStandaloneSessions(userId: string, db: DbClient = prisma) {
  return db.appSession.findMany({
    where: {
      userId,
      kind: "standalone",
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export async function cleanupExpiredAppSessions() {
  return prisma.appSession.updateMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
