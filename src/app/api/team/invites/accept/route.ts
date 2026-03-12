import { NextResponse } from "next/server";
import { acceptInviteToken } from "@/lib/teamAccess";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; email?: string; displayName?: string }
    | null;

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";

  if (!token) {
    return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
  }

  const result = await acceptInviteToken({
    token,
    email,
    displayName: displayName || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, accepted: result.result });
}
