import { NextResponse } from 'next/server';

function maskPresence(value: string | undefined) {
  return Boolean(value);
}

function hasSslMode(url: string | undefined) {
  if (!url) return false;
  return /[?&]sslmode=/.test(url);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: maskPresence(process.env.DATABASE_URL),
      DATABASE_SSL_CA: maskPresence(process.env.DATABASE_SSL_CA),
      DATABASE_URL_HAS_SSLMODE: hasSslMode(process.env.DATABASE_URL),
    },
  });
}
