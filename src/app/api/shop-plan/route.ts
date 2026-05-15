import { PlanStatus, PlanTier, ShopRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateApiRequest, requireAuthorizedShopRole } from "@/lib/auth";
import { isMissingPlanColumnError, transitionShopPlanByDomain } from "@/data/plans";
import { applyEmbeddedAppContextToSearchParams, resolveEmbeddedAppContext } from "@/lib/embeddedAppContext";

type ShopPlanPayload = {
  shop?: string;
  planTier?: string | null;
  planStatus?: string | null;
};

type ShopPlanDependencies = {
  authenticate: typeof authenticateApiRequest;
  transitionPlan: typeof transitionShopPlanByDomain;
};

const defaultDependencies: ShopPlanDependencies = {
  authenticate: authenticateApiRequest,
  transitionPlan: transitionShopPlanByDomain,
};

function isPlanTier(value: string | null | undefined): value is PlanTier {
  return value === PlanTier.FREE || value === PlanTier.STANDARD || value === PlanTier.PREMIUM;
}

function isPlanStatus(value: string | null | undefined): value is PlanStatus {
  return (
    value === PlanStatus.ACTIVE ||
    value === PlanStatus.TRIALING ||
    value === PlanStatus.PAST_DUE ||
    value === PlanStatus.CANCELED
  );
}

async function parsePayload(request: Request): Promise<ShopPlanPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as ShopPlanPayload;
  }

  const form = await request.formData();
  return {
    shop: (form.get("shop") as string | null) ?? undefined,
    planTier: (form.get("planTier") as string | null) ?? undefined,
    planStatus: (form.get("planStatus") as string | null) ?? undefined,
  };
}

function resolvePostRedirectParams(request: Request, shopDomain: string, plan: "saved" | "unchanged") {
  const referer = request.headers.get("referer");
  const refererUrl = referer ? new URL(referer) : null;
  const embeddedContext = resolveEmbeddedAppContext({
    searchParams: refererUrl?.searchParams,
    cookieHeader: request.headers.get("cookie"),
  });

  const params = new URLSearchParams({
    shop: shopDomain,
    plan,
  });
  applyEmbeddedAppContextToSearchParams(params, embeddedContext);
  return params;
}

export async function handleShopPlanUpdate(
  request: Request,
  dependencies: ShopPlanDependencies = defaultDependencies,
) {
  const auth = await dependencies.authenticate(request);
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await parsePayload(request);
  const shopDomain = typeof payload.shop === "string" ? payload.shop : null;

  if (!shopDomain) {
    return NextResponse.json({ error: "Missing shop domain" }, { status: 400 });
  }

  const roleGuard = requireAuthorizedShopRole(auth, shopDomain, ShopRole.ADMIN);
  if (roleGuard) {
    return roleGuard;
  }

  const targetTier = isPlanTier(payload.planTier) ? payload.planTier : undefined;
  const targetStatus = isPlanStatus(payload.planStatus) ? payload.planStatus : undefined;

  if (!targetTier && !targetStatus) {
    return NextResponse.json(
      { error: "Provide a valid planTier or planStatus" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await dependencies.transitionPlan({
      shopDomain,
      targetTier,
      targetStatus,
    });
  } catch (error) {
    if (isMissingPlanColumnError(error)) {
      return NextResponse.json(
        {
          error: "Plan fields are not available in the current database yet. Run the shop plan migration first.",
          code: "PLAN_SCHEMA_MISSING",
        },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!result) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const acceptsJson = request.headers.get("accept")?.includes("application/json");
  if (acceptsJson) {
    return NextResponse.json({
      ok: true,
      changed: result.changed,
      direction: result.direction,
      shopDomain: result.shopDomain,
      planTier: result.planTier,
      planStatus: result.planStatus,
      planUpdatedAt: result.planUpdatedAt,
    });
  }

  const origin = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") ?? new URL(request.url).origin;
  const params = resolvePostRedirectParams(
    request,
    result.shopDomain,
    result.changed ? "saved" : "unchanged",
  );
  return NextResponse.redirect(`${origin}/settings?${params.toString()}`, 303);
}

export async function POST(request: Request) {
  return handleShopPlanUpdate(request);
}
