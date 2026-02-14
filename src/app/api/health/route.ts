import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/observability";

export async function GET() {
  const db = await checkDatabaseHealth();

  if (!db.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        checks: {
          database: db,
        },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "healthy",
    checks: {
      database: db,
    },
  });
}
