import { NextResponse } from "next/server";
import { deliverMagicLink } from "@/lib/magicLinkDelivery";
import { createMagicLinkLogin } from "@/lib/magicLinks";
import { enforceMagicLinkRequestRateLimit } from "@/lib/magicLinkRateLimit";

type MagicLinkRequestDeps = {
  enforceRateLimit: typeof enforceMagicLinkRequestRateLimit;
  createLogin: typeof createMagicLinkLogin;
  deliver: typeof deliverMagicLink;
};

export async function handleMagicLinkRequest(
  request: Request,
  deps: MagicLinkRequestDeps,
) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const forwardedFor = request.headers.get("x-forwarded-for");

  const rateLimit = await deps.enforceRateLimit({
    email,
    ipAddress: forwardedFor,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: rateLimit.error },
      {
        status: rateLimit.status,
        headers: {
          "retry-after": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const result = await deps.createLogin({
    email,
    origin: new URL(request.url).origin,
    requestedFromIp: forwardedFor,
    requestedUserAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const delivery = await deps.deliver({
    email: result.email,
    magicLinkUrl: result.loginLink,
    expiresAt: result.expiresAt,
  });

  return NextResponse.json({
    ok: true,
    message: "If that address can sign in, a magic link has been prepared.",
    previewUrl: delivery.previewUrl,
  });
}

export async function POST(request: Request) {
  return handleMagicLinkRequest(request, {
    enforceRateLimit: enforceMagicLinkRequestRateLimit,
    createLogin: createMagicLinkLogin,
    deliver: deliverMagicLink,
  });
}
