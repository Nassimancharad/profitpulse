import prisma from "@/lib/prisma";

export const SHOPIFY_USER_PROVIDER = "shopify";
export const EMAIL_USER_PROVIDER = "email";

type UserAccountDb = Pick<typeof prisma, "appUser">;

export function normalizeEmailAddress(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function findUserByProviderIdentity(provider: string, externalId: string) {
  return prisma.appUser.findUnique({
    where: {
      provider_externalId: {
        provider,
        externalId,
      },
    },
  });
}

export async function upsertUserByProviderIdentity(input: {
  db?: UserAccountDb;
  provider: string;
  externalId: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const db = input.db ?? prisma;
  const normalizedEmail = normalizeEmailAddress(input.email);
  return db.appUser.upsert({
    where: {
      provider_externalId: {
        provider: input.provider,
        externalId: input.externalId,
      },
    },
    create: {
      provider: input.provider,
      externalId: input.externalId,
      email: normalizedEmail || undefined,
      displayName: input.displayName || undefined,
    },
    update: {
      email: normalizedEmail || undefined,
      displayName: input.displayName || undefined,
    },
  });
}
