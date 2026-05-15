import { resolveAppPageAuth, type AppPageSearchParams } from "@/lib/appPageAuth";

type AppPageProps = {
  searchParams: Promise<AppPageSearchParams<{
    shop?: string;
  }>>;
};

export default async function AppPage({ searchParams }: AppPageProps) {
  const { searchParams: resolvedSearchParams } = await resolveAppPageAuth(searchParams, {
    returnTo: "/app",
  });
  const shop = resolvedSearchParams?.shop || "unknown-shop";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 text-zinc-900">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center text-xl font-semibold text-zinc-900">
          ProfitPulse
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Embedded app landing page. OAuth succeeded if you see this.
        </p>
        <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">Shop</p>
          <p className="text-lg font-semibold text-zinc-900">{shop}</p>
        </div>
        <div className="mt-6 text-sm text-zinc-600">
          <p>Next steps:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Build the embedded UI for dashboard/products/costs.</li>
            <li>Optionally add session/JWT verification for Admin requests.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
