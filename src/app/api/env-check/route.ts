import { NextResponse } from 'next/server';

function maskPresence(value: string | undefined) {
  return Boolean(value);
}

function hasSslMode(url: string | undefined) {
  if (!url) return false;
  return /[?&]sslmode=/.test(url);
}

function decodeCaPreview() {
  const raw = process.env.DATABASE_SSL_CA_BASE64;
  if (!raw) {
    return {
      length: 0,
      startsWithPem: false,
      endsWithPem: false,
    };
  }
  const decoded = Buffer.from(raw, "base64").toString("utf-8").trim();
  return {
    length: decoded.length,
    startsWithPem: decoded.startsWith("-----BEGIN CERTIFICATE-----"),
    endsWithPem: decoded.endsWith("-----END CERTIFICATE-----"),
  };
}

function getDatabaseHost() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function GET() {
  const caPreview = decodeCaPreview();
  const databaseHost = getDatabaseHost();
  const usesPooler = Boolean(databaseHost && databaseHost.includes("pooler.supabase.com"));
  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: maskPresence(process.env.DATABASE_URL),
      DATABASE_SSL_CA: maskPresence(process.env.DATABASE_SSL_CA),
      DATABASE_SSL_CA_BASE64: maskPresence(process.env.DATABASE_SSL_CA_BASE64),
      DATABASE_URL_HAS_SSLMODE: hasSslMode(process.env.DATABASE_URL),
      NODE_EXTRA_CA_CERTS: maskPresence(process.env.NODE_EXTRA_CA_CERTS),
      PGSSLMODE: maskPresence(process.env.PGSSLMODE),
      PGSSLROOTCERT: maskPresence(process.env.PGSSLROOTCERT),
    },
    db: {
      host: databaseHost,
      usesPooler,
    },
    caPreview,
  });
}
