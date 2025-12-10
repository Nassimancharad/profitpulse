import { AppShell } from '@/components/AppShell';

export default function SettingsPage() {
  return (
    <AppShell title="Settings" periodLabel="Last 30 days" shopLabel="Demo shop">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-xl font-semibold text-white">Settings coming soon</h2>
        <p className="mt-2 text-sm text-slate-200">
          Manage shop info, timezone, currency, and resync options.
        </p>
      </div>
    </AppShell>
  );
}
