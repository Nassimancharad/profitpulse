export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[var(--pp-bg,#0b1221)] text-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-white">Data Deletion Instructions</h1>
        <p className="mt-3 text-slate-200">
          If you uninstall ProfitPulse from your Shopify store, we will stop accessing your store and ad data. You can also request deletion of stored data at any time.
        </p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-white">How to Request Deletion</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Email us at support@profitpulse.app with your shop domain (e.g., yourstore.myshopify.com).</li>
              <li>Or submit a request through your Shopify admin if available.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">What We Delete</h2>
            <p className="mt-2">
              We remove stored shop data related to your account, including synced products, orders, ad account connections, and ad spend records, unless retention is required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Timeline</h2>
            <p className="mt-2">
              We aim to process deletion requests within 30 days. You will receive confirmation once deletion is complete.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Questions</h2>
            <p className="mt-2">
              Contact us at support@profitpulse.app for any questions about data deletion or privacy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
