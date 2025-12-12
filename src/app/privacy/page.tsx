export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[var(--pp-bg,#0b1221)] text-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-white">Privacy Policy</h1>
        <p className="mt-3 text-slate-200">
          ProfitPulse collects and processes data only to provide analytics for your Shopify store and connected ad platforms. We do not sell or rent your data.
        </p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-white">Data We Process</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Shop data from Shopify needed for app functionality (products, orders, and related fields).</li>
              <li>Ad account data from connected platforms (Meta Ads) used to calculate spend and performance.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">How We Use Data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide reporting on sales, costs, and advertising performance.</li>
              <li>Maintain and improve the ProfitPulse service.</li>
              <li>Meet legal, security, and compliance obligations.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Data Sharing</h2>
            <p className="mt-2">
              We do not sell personal data. We share data only with essential service providers (e.g., hosting, databases) under confidentiality and security obligations, or when required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Retention</h2>
            <p className="mt-2">
              We retain data for as long as your shop uses ProfitPulse or as required by law. You can request deletion of shop data by contacting us.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Security</h2>
            <p className="mt-2">
              We use reasonable technical and organizational measures to protect data. No method of transmission or storage is 100% secure.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Your Rights</h2>
            <p className="mt-2">
              Depending on your jurisdiction, you may have rights to access, correct, or delete your data. Contact us to exercise these rights.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">Contact</h2>
            <p className="mt-2">
              For privacy questions or requests, contact support@profitpulse.app.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
