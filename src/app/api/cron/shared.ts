import { NextResponse } from "next/server";
import { logWarn } from "@/observability/logger";

export function verifyCronRequest(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true };
    }
    logWarn("cron_secret_missing");
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      ),
    };
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}

export function parseCronMaxPages(value: string | null, fallback?: number) {
  const parsed = value ? Number.parseInt(value, 10) : null;
  if (parsed && Number.isFinite(parsed) && parsed > 0) return parsed;
  if (fallback && Number.isFinite(fallback) && fallback > 0) return Math.floor(fallback);
  return undefined;
}
