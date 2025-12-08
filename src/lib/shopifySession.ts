import crypto from "node:crypto";

type SessionTokenPayload = {
  iss: string; // Shopify
  dest: string; // https://{shop}.myshopify.com/admin
  aud: string; // your app api key
  sub: string; // shop id
  exp: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  sid?: string;
};

type AuthResult =
  | { ok: true; shop: string; payload: SessionTokenPayload }
  | { ok: false; status: number; error: string };

const requiredEnv = ["SHOPIFY_API_SECRET", "SHOPIFY_API_KEY"] as const;

function getEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return {
    apiSecret: process.env.SHOPIFY_API_SECRET!,
    apiKey: process.env.SHOPIFY_API_KEY!,
  };
}

function base64UrlDecode(segment: string): string {
  return Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function extractShop(dest: string) {
  try {
    const url = new URL(dest);
    const host = url.hostname;
    if (!host.endsWith(".myshopify.com") || host.split(".").length < 3) {
      throw new Error("Invalid shop host");
    }
    return host;
  } catch {
    throw new Error("Invalid dest in token");
  }
}

export function verifyShopifySessionToken(token: string): { shop: string; payload: SessionTokenPayload } {
  const env = getEnv();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const headerJson = base64UrlDecode(headerB64);
  const header = JSON.parse(headerJson) as { alg?: string; typ?: string };
  if (header.alg !== "HS256") {
    throw new Error("Unsupported alg");
  }

  const expectedSig = crypto
    .createHmac("sha256", env.apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  if (!timingSafeEqual(expectedSig, signatureB64)) {
    throw new Error("Invalid signature");
  }

  const payloadJson = base64UrlDecode(payloadB64);
  const payload = JSON.parse(payloadJson) as SessionTokenPayload;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }
  if (payload.nbf && payload.nbf > now) {
    throw new Error("Token not yet valid");
  }
  if (payload.aud !== env.apiKey) {
    throw new Error("Audience mismatch");
  }

  const shop = extractShop(payload.dest);
  return { shop, payload };
}

export function authenticateShopifyRequest(request: Request): AuthResult {
  const authHeader =
    request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const token = authHeader.substring("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Empty token" };
  }

  try {
    const { shop, payload } = verifyShopifySessionToken(token);
    return { ok: true, shop, payload };
  } catch (error) {
    return {
      ok: false,
      status: 401,
      error: error instanceof Error ? error.message : "Invalid session token",
    };
  }
}
