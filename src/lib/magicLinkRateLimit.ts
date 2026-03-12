import crypto from "node:crypto";
import prisma from "@/lib/prisma";

const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

const LIMITS = {
  requestByEmail: 5,
  requestByIp: 20,
  verifyByIp: 30,
} as const;

type RateLimitCheckResult =
  | { ok: true }
  | { ok: false; status: 429; error: string; retryAfterSeconds: number };

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeIp(ip: string | null | undefined) {
  if (!ip) return "";
  return ip.split(",")[0]?.trim() ?? "";
}

function cutoffDate(windowMs: number) {
  return new Date(Date.now() - windowMs);
}

async function countRecent(scope: string, key: string, windowMs: number) {
  return prisma.authRateLimitEvent.count({
    where: {
      scope,
      key,
      createdAt: {
        gte: cutoffDate(windowMs),
      },
    },
  });
}

async function record(scope: string, key: string) {
  await prisma.authRateLimitEvent.create({
    data: {
      scope,
      key,
    },
  });
}

function retryAfterSeconds(windowMs: number) {
  return Math.ceil(windowMs / 1000);
}

export function normalizeRateLimitEmailKey(email: string) {
  return `email:${hashKey(email.trim().toLowerCase())}`;
}

export function normalizeRateLimitIpKey(ip: string | null | undefined) {
  const normalized = normalizeIp(ip);
  return normalized ? `ip:${hashKey(normalized)}` : "";
}

export async function enforceMagicLinkRequestRateLimit(input: {
  email: string;
  ipAddress: string | null | undefined;
}): Promise<RateLimitCheckResult> {
  const emailKey = normalizeRateLimitEmailKey(input.email);
  const ipKey = normalizeRateLimitIpKey(input.ipAddress);

  const [emailCount, ipCount] = await Promise.all([
    countRecent("magic_link_request", emailKey, REQUEST_WINDOW_MS),
    ipKey ? countRecent("magic_link_request", ipKey, REQUEST_WINDOW_MS) : Promise.resolve(0),
  ]);

  if (emailCount >= LIMITS.requestByEmail || ipCount >= LIMITS.requestByIp) {
    return {
      ok: false,
      status: 429,
      error: "Too many magic link requests. Try again later.",
      retryAfterSeconds: retryAfterSeconds(REQUEST_WINDOW_MS),
    };
  }

  await Promise.all([
    record("magic_link_request", emailKey),
    ipKey ? record("magic_link_request", ipKey) : Promise.resolve(),
  ]);

  return { ok: true };
}

export async function enforceMagicLinkVerifyRateLimit(input: {
  ipAddress: string | null | undefined;
}): Promise<RateLimitCheckResult> {
  const ipKey = normalizeRateLimitIpKey(input.ipAddress);
  if (!ipKey) {
    return { ok: true };
  }

  const ipCount = await countRecent("magic_link_verify", ipKey, VERIFY_WINDOW_MS);
  if (ipCount >= LIMITS.verifyByIp) {
    return {
      ok: false,
      status: 429,
      error: "Too many login attempts. Try again later.",
      retryAfterSeconds: retryAfterSeconds(VERIFY_WINDOW_MS),
    };
  }

  await record("magic_link_verify", ipKey);
  return { ok: true };
}
