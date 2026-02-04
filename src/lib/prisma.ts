import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool, type PoolConfig } from "pg";

// Reuse a single PrismaClient instance across hot reloads in Next.js.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};
const databaseUrl = process.env.DATABASE_URL;
const isTest = process.env.NODE_ENV === "test";
let client: PrismaClient;

function readIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getDatabaseHost(connectionString: string) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

function normalizeDatabaseUrl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("sslrootcert");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function buildPoolOptions(connectionString: string): PoolConfig {
  const host = getDatabaseHost(connectionString);
  const usesPooler = Boolean(host && host.includes("pooler.supabase.com"));
  const isProduction = process.env.NODE_ENV === "production";
  const servername = host ?? undefined;
  const allowInsecure = process.env.DATABASE_SSL_INSECURE === "true";
  const normalizedConnectionString = normalizeDatabaseUrl(connectionString);
  const max = readIntEnv("PGPOOL_MAX", isProduction ? 1 : 5);
  const idleTimeoutMillis = readIntEnv("PGPOOL_IDLE_TIMEOUT_MS", 10_000);
  const connectionTimeoutMillis = readIntEnv("PGPOOL_CONNECT_TIMEOUT_MS", 10_000);
  const sslCaBase64 = process.env.DATABASE_SSL_CA_BASE64?.replace(/\s+/g, "");
  const sslCaDecoded = sslCaBase64
    ? Buffer.from(sslCaBase64, "base64").toString("utf-8").trim()
    : null;
  const sslCaRaw = sslCaDecoded ?? process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const sslCa = sslCaRaw ? sslCaRaw.trim() : null;
  const sslCaBuffer = sslCa ? Buffer.from(sslCa, "utf-8") : null;
  const base: PoolConfig = {
    connectionString: normalizedConnectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  };
  if (allowInsecure) {
    return {
      ...base,
      ssl: { rejectUnauthorized: false, servername },
    };
  }
  if (sslCaBuffer) {
    return {
      ...base,
      ssl: {
        ca: sslCaBuffer,
        rejectUnauthorized: true,
        servername,
      },
    };
  }
  if (usesPooler) {
    return {
      ...base,
      ssl: { rejectUnauthorized: true, servername },
    };
  }
  return base;
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
  const pool = globalForPrisma.prismaPool ?? new Pool(buildPoolOptions(databaseUrl));
  client = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });
  globalForPrisma.prismaPool = pool;
  globalForPrisma.prisma = client;
}

export default client;
