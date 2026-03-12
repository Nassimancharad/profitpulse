import crypto from "node:crypto";
import { ShopRole } from "@prisma/client";

const INVITE_TTL_DAYS = 7;

export function normalizeInviteEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidInviteRole(value: unknown): value is ShopRole {
  return value === ShopRole.ADMIN || value === ShopRole.EDITOR || value === ShopRole.VIEWER;
}

export function createInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildInviteUrl(token: string) {
  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const baseUrl = appUrl || "http://localhost:3000";
  return `${baseUrl}/invites/accept?token=${encodeURIComponent(token)}`;
}

export function defaultInviteExpiry(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  return expiresAt;
}
