import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Reuse a single PrismaClient instance across hot reloads in Next.js.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL;
const isTest = process.env.NODE_ENV === "test";
let client: PrismaClient;

function buildPoolOptions() {
  const sslCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  if (!sslCa) return { connectionString: databaseUrl };
  return {
    connectionString: databaseUrl,
    ssl: {
      ca: sslCa,
      rejectUnauthorized: true,
    },
  };
}

if (!databaseUrl) {
  if (isTest) {
    client = new Proxy(
      {},
      {
        get() {
          throw new Error(
            "Prisma client is mocked in tests. Set DATABASE_URL to enable DB access.",
          );
        },
      },
    ) as PrismaClient;
  } else {
    throw new Error("Missing required env var: DATABASE_URL");
  }
} else {
  const pool = new Pool(buildPoolOptions());
  client =
    globalForPrisma.prisma ??
    new PrismaClient({
      adapter: new PrismaPg(pool),
    });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

export default client;
