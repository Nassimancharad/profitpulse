import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateApiRequest, isAuthorizedForShop } from '@/lib/auth';

type Payload = {
  shop?: string;
  scope?: string;
  name?: string;
  amount?: string | number;
  startDate?: string;
  endDate?: string;
};

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const deleteId = url.searchParams.get('id');
  const deleteShop = url.searchParams.get('shop');
  if (url.searchParams.get('delete') === '1' && deleteId && deleteShop) {
    if (!isAuthorizedForShop(auth, deleteShop)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shop = await prisma.shop.findUnique({
      where: { shopDomain: deleteShop },
      select: { id: true },
    });
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    if (!(prisma as any).expense?.delete) {
      return NextResponse.json(
        { error: 'Expense model not available. Run Prisma generate/migrate.' },
        { status: 400 },
      );
    }
    await (prisma as any).expense.deleteMany({
      where: {
        id: deleteId,
        OR: [{ shopId: shop.id }, { shopId: null }],
      },
    });
    const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, '');
    const origin = appUrl ?? new URL(request.url).origin;
    const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(deleteShop)}&expenses=deleted`;
    return NextResponse.redirect(redirectUrl, 303);
  }

  const contentType = request.headers.get('content-type') ?? '';
  let payload: Payload = {};

  if (contentType.includes('application/json')) {
    payload = (await request.json().catch(() => ({}))) as Payload;
  } else {
    const form = await request.formData();
    payload = {
      shop: (form.get('shop') as string | null) ?? undefined,
      scope: (form.get('scope') as string | null) ?? undefined,
      name: (form.get('name') as string | null) ?? undefined,
      amount: (form.get('amount') as string | null) ?? undefined,
      startDate: (form.get('startDate') as string | null) ?? undefined,
      endDate: (form.get('endDate') as string | null) ?? undefined,
    };
  }

  const shopDomain = typeof payload.shop === 'string' ? payload.shop : null;
  if (!shopDomain) {
    return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
  }
  if (!isAuthorizedForShop(auth, shopDomain)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = payload.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Missing expense name' }, { status: 400 });
  }

  const amount = toNumber(payload.amount);
  if (amount <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const startDate = parseDate(payload.startDate);
  if (!startDate) {
    return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
  }
  const endDate = parseDate(payload.endDate ?? undefined);

  let shopId: string | null = null;
  if (payload.scope !== 'portfolio') {
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    shopId = shop.id;
  }

  if (!(prisma as any).expense?.create) {
    return NextResponse.json(
      { error: 'Expense model not available. Run Prisma generate/migrate.' },
      { status: 400 },
    );
  }

  await (prisma as any).expense.create({
    data: {
      shopId,
      name,
      amount,
      frequency: 'monthly',
      startDate,
      endDate,
    },
  });

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, '');
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(shopDomain)}&expenses=saved`;
  return NextResponse.redirect(redirectUrl, 303);
}

export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const shopDomain = url.searchParams.get('shop');
  if (!id || !shopDomain) {
    return NextResponse.json({ error: 'Missing id or shop' }, { status: 400 });
  }
  if (!isAuthorizedForShop(auth, shopDomain)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  if (!(prisma as any).expense?.delete) {
    return NextResponse.json(
      { error: 'Expense model not available. Run Prisma generate/migrate.' },
      { status: 400 },
    );
  }

  await (prisma as any).expense.deleteMany({
    where: {
      id,
      OR: [{ shopId: shop.id }, { shopId: null }],
    },
  });

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, '');
  const origin = appUrl ?? new URL(request.url).origin;
  const redirectUrl = `${origin}/costs?shop=${encodeURIComponent(shopDomain)}&expenses=deleted`;
  return NextResponse.redirect(redirectUrl, 303);
}
