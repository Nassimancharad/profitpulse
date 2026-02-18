import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateApiRequest, isAuthorizedForShop } from '@/lib/auth';

type Payload = {
  shop?: string;
  paymentFeePct?: string | number | null;
  paymentFeeFixed?: string | number | null;
};

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const contentType = request.headers.get('content-type') ?? '';
  let payload: Payload = {};

  if (contentType.includes('application/json')) {
    payload = (await request.json().catch(() => ({}))) as Payload;
  } else {
    const form = await request.formData();
    payload = {
      shop: (form.get('shop') as string | null) ?? undefined,
      paymentFeePct: form.get('paymentFeePct') as string | null,
      paymentFeeFixed: form.get('paymentFeeFixed') as string | null,
    };
  }

  const shopDomain = typeof payload.shop === 'string' ? payload.shop : null;
  if (!shopDomain) {
    return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
  }
  if (!isAuthorizedForShop(auth, shopDomain)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paymentFeePct = toNumber(payload.paymentFeePct);
  const paymentFeeFixed = toNumber(payload.paymentFeeFixed);

  try {
    await prisma.shop.update({
      where: { shopDomain },
      data: {
        paymentFeePct,
        paymentFeeFixed,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Shop settings update failed. Prisma client is missing fee fields.' },
      { status: 400 },
    );
  }

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "");
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(shopDomain)}&fees=saved`;
  return NextResponse.redirect(redirectUrl, 303);
}
