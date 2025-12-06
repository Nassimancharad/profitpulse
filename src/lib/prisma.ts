import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Reuse a single PrismaClient instance across hot reloads in Next.js.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

export default client;
