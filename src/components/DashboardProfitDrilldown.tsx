"use client";

import { useEffect, useMemo, useState } from "react";
import { KpiTwoPanelChart, type KpiKey } from "@/components/KpiTwoPanelChart";
import { getCurrencyFormatter, getNumberFormatter, getPercentFormatter } from "@/lib/currency";
import { buildLineItemProfitBreakdown } from "@/domain/profit-engine/drilldown";

type KpiSeries = Record<KpiKey, number[]>;

type KpiOption = {
  key: KpiKey;
  label: string;
  format: "currency" | "number" | "percent" | "ratio";
};

type DrilldownOrder = {
  orderId: string;
  shopifyOrderId: string;
  createdAt: string;
  dayKey: string;
  shopLabel: string | null;
  netProductRevenue: number;
  netShippingRevenue: number;
  cogs: number;
  shippingCost: number;
  adCostAllocated: number;
  paymentFee: number;
  netProfit: number;
};

type DrilldownLine = {
  lineId: string;
  orderId: string;
  quantity: number;
  lineRevenue: number;
  costPerUnit: number | null;
  productTitle: string;
  variantTitle: string | null;
  variantSku: string | null;
};

type Props = {
  dateKeys: string[];
  kpiOptions: KpiOption[];
  aggregateSeries: KpiSeries;
  comparisonSeries?: KpiSeries;
  comparisonDateKeys?: string[];
  comparisonLabel?: string;
  currency?: string | null;
  orders: DrilldownOrder[];
  lines: DrilldownLine[];
  showShopColumn: boolean;
};

function toDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function DashboardProfitDrilldown({
  dateKeys,
  kpiOptions,
  aggregateSeries,
  comparisonSeries,
  comparisonDateKeys,
  comparisonLabel,
  currency,
  orders,
  lines,
  showShopColumn,
}: Props) {
  const currencyFormatter = useMemo(() => getCurrencyFormatter({ currency }), [currency]);
  const numberFormatter = useMemo(() => getNumberFormatter("en-US"), []);
  const percentFormatter = useMemo(
    () => getPercentFormatter("en-US", { maximumFractionDigits: 1 }),
    [],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );

  const ordersByDay = useMemo(() => {
    const map = new Map<string, DrilldownOrder[]>();
    for (const order of orders) {
      const bucket = map.get(order.dayKey) ?? [];
      bucket.push(order);
      map.set(order.dayKey, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const left = toDate(a.createdAt)?.getTime() ?? 0;
        const right = toDate(b.createdAt)?.getTime() ?? 0;
        return right - left;
      });
    }
    return map;
  }, [orders]);

  const linesByOrder = useMemo(() => {
    const map = new Map<string, DrilldownLine[]>();
    for (const line of lines) {
      const bucket = map.get(line.orderId) ?? [];
      bucket.push(line);
      map.set(line.orderId, bucket);
    }
    return map;
  }, [lines]);

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (dateKeys.length === 0) {
      setSelectedDayKey(null);
      return;
    }
    if (selectedDayKey && dateKeys.includes(selectedDayKey)) return;
    const firstWithOrders = dateKeys.find((key) => (ordersByDay.get(key)?.length ?? 0) > 0) ?? null;
    setSelectedDayKey(firstWithOrders ?? dateKeys[dateKeys.length - 1] ?? null);
  }, [dateKeys, ordersByDay, selectedDayKey]);

  const selectedDayOrders = useMemo(
    () => (selectedDayKey ? ordersByDay.get(selectedDayKey) ?? [] : []),
    [ordersByDay, selectedDayKey],
  );

  useEffect(() => {
    if (selectedDayOrders.length === 0) {
      setSelectedOrderId(null);
      return;
    }
    if (selectedOrderId && selectedDayOrders.some((order) => order.orderId === selectedOrderId)) return;
    setSelectedOrderId(selectedDayOrders[0]?.orderId ?? null);
  }, [selectedDayOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => selectedDayOrders.find((order) => order.orderId === selectedOrderId) ?? null,
    [selectedDayOrders, selectedOrderId],
  );

  const selectedOrderLines = useMemo(
    () =>
      selectedOrder
        ? linesByOrder.get(selectedOrder.orderId) ?? []
        : [],
    [linesByOrder, selectedOrder],
  );

  const lineBreakdown = useMemo(() => {
    if (!selectedOrder) return [];
    return buildLineItemProfitBreakdown(selectedOrderLines, {
      shippingCost: selectedOrder.shippingCost,
      adCostAllocated: selectedOrder.adCostAllocated,
      paymentFee: selectedOrder.paymentFee,
      netProductRevenue: selectedOrder.netProductRevenue,
      netShippingRevenue: selectedOrder.netShippingRevenue,
    });
  }, [selectedOrder, selectedOrderLines]);

  return (
    <div className="space-y-6">
      <KpiTwoPanelChart
        dateKeys={dateKeys}
        kpiOptions={kpiOptions}
        aggregateSeries={aggregateSeries}
        comparisonSeries={comparisonSeries}
        comparisonDateKeys={comparisonDateKeys}
        comparisonLabel={comparisonLabel}
        storeSeries={[]}
        defaultSelected={["revenue", "profit", "adSpend"]}
        defaultCompare="revenue"
        currency={currency}
        onDateSelect={setSelectedDayKey}
        selectedDateKey={selectedDayKey}
      />

      <section className="pp-card glass-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Drilldown</p>
            <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Day to orders</h3>
          </div>
          <span className="pp-badge glass-inset px-3 py-1 text-xs">
            {selectedDayKey ?? "No day selected"}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--pp-border)] bg-white/60">
          <table className="pp-table min-w-full divide-y divide-black/5 text-sm">
            <thead className="bg-white/70">
              <tr className="text-left text-[color:var(--pp-muted)]">
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Created</th>
                {showShopColumn ? <th className="px-3 py-2 font-medium">Store</th> : null}
                <th className="px-3 py-2 font-medium">Revenue</th>
                <th className="px-3 py-2 font-medium">COGS</th>
                <th className="px-3 py-2 font-medium">Shipping</th>
                <th className="px-3 py-2 font-medium">Ads</th>
                <th className="px-3 py-2 font-medium">Fees</th>
                <th className="px-3 py-2 font-medium">Net profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {selectedDayOrders.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-[color:var(--pp-muted)]" colSpan={showShopColumn ? 9 : 8}>
                    No orders on this day.
                  </td>
                </tr>
              ) : (
                selectedDayOrders.map((order) => {
                  const revenue = order.netProductRevenue + order.netShippingRevenue;
                  const isSelected = order.orderId === selectedOrderId;
                  return (
                    <tr
                      key={order.orderId}
                      className={`cursor-pointer transition hover:bg-white/70 ${isSelected ? "bg-white/80" : ""}`}
                      onClick={() => setSelectedOrderId(order.orderId)}
                    >
                      <td className="px-3 py-2.5 font-medium text-[color:var(--pp-foreground)]">{order.shopifyOrderId}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">
                        {(() => {
                          const createdAt = toDate(order.createdAt);
                          return createdAt ? timeFormatter.format(createdAt) : "—";
                        })()}
                      </td>
                      {showShopColumn ? <td className="px-3 py-2.5 text-[color:var(--pp-muted)]">{order.shopLabel ?? "—"}</td> : null}
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(revenue)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(order.cogs)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(order.shippingCost)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(order.adCostAllocated)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(order.paymentFee)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[color:var(--pp-foreground)]">{currencyFormatter.format(order.netProfit)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pp-card glass-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pp-muted)]">Drilldown</p>
            <h3 className="text-lg font-semibold text-[color:var(--pp-foreground)]">Order to line items</h3>
          </div>
          <span className="pp-badge glass-inset px-3 py-1 text-xs">
            {selectedOrder ? `Order ${selectedOrder.shopifyOrderId}` : "Select an order"}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--pp-border)] bg-white/60">
          <table className="pp-table min-w-full divide-y divide-black/5 text-sm">
            <thead className="bg-white/70">
              <tr className="text-left text-[color:var(--pp-muted)]">
                <th className="px-3 py-2 font-medium">Line item</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Share</th>
                <th className="px-3 py-2 font-medium">Revenue</th>
                <th className="px-3 py-2 font-medium">Refund alloc.</th>
                <th className="px-3 py-2 font-medium">Ship rev alloc.</th>
                <th className="px-3 py-2 font-medium">Net revenue</th>
                <th className="px-3 py-2 font-medium">COGS</th>
                <th className="px-3 py-2 font-medium">Gross profit</th>
                <th className="px-3 py-2 font-medium">Alloc. shipping</th>
                <th className="px-3 py-2 font-medium">Alloc. ads</th>
                <th className="px-3 py-2 font-medium">Alloc. fees</th>
                <th className="px-3 py-2 font-medium">Allocated total</th>
                <th className="px-3 py-2 font-medium">Net line profit</th>
                <th className="px-3 py-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {!selectedOrder ? (
                <tr>
                  <td className="px-3 py-6 text-[color:var(--pp-muted)]" colSpan={15}>
                    Select an order above to view line-level breakdown.
                  </td>
                </tr>
              ) : lineBreakdown.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-[color:var(--pp-muted)]" colSpan={15}>
                    No line items found for this order.
                  </td>
                </tr>
              ) : (
                lineBreakdown.map((line) => {
                  const lineLabel = line.variantTitle && line.variantTitle !== line.productTitle
                    ? `${line.productTitle} · ${line.variantTitle}`
                    : line.productTitle;
                  return (
                    <tr key={line.lineId} className="transition hover:bg-white/70">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[color:var(--pp-foreground)]">{lineLabel}</div>
                        {line.variantSku ? (
                          <div className="text-xs text-[color:var(--pp-muted)]">SKU: {line.variantSku}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{numberFormatter.format(line.quantity)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{percentFormatter.format(line.allocationShare)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.lineRevenue)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedProductRefund)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedNetShippingRevenue)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.netLineRevenue)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.lineCost)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.grossProfit)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedShippingCost)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedAdCost)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedPaymentFee)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.allocatedCosts)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[color:var(--pp-foreground)]">{currencyFormatter.format(line.netLineProfit)}</td>
                      <td className="px-3 py-2.5 text-[color:var(--pp-foreground)]">{percentFormatter.format(line.margin)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
