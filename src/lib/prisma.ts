import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Reuse a single PrismaClient instance across hot reloads in Next.js.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL;
const isTest = process.env.NODE_ENV === "test";
let client: PrismaClient;

function getDatabaseHost() {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

function buildPoolOptions() {
  const host = getDatabaseHost();
  const usesPooler = Boolean(host && host.includes("pooler.supabase.com"));
  const sslCaBase64 = process.env.DATABASE_SSL_CA_BASE64;
  const sslCaDecoded = sslCaBase64
    ? Buffer.from(sslCaBase64, "base64").toString("utf-8")
    : null;
  const sslCa = sslCaDecoded ?? process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  if (!sslCa) return { connectionString: databaseUrl };
  if (usesPooler) {
    // Supabase pooler uses a public CA; custom CA can break verification.
    return {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: true },
    };
  }
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
