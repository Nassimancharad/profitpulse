import { AppShell } from '@/components/AppShell';

export default function CostsPage() {
  return (
    <AppShell title="Costs" subtitle="Inkoopkosten" periodLabel="Last 30 days" shopLabel="Demo shop">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h2 className="text-xl font-semibold text-white">Costs coming soon</h2>
        <p className="mt-2 text-sm text-slate-200">
          Edit cost per unit for products. This view will include inline editing and mobile-friendly inputs.
        </p>
      </div>
    </AppShell>
  );
}
