# Profit Calculation Glossary

This document defines the canonical financial terms used in ProfitPulse.
All terms below align with the fields used in the codebase.

## Revenue Terms

- product_revenue (gross): Sum of order line revenue before refunds.
- shipping_revenue (gross): Shipping revenue collected before refunds.
- refunded_product_amount: Total product refunds applied to orders.
- refunded_shipping_amount: Total shipping refunds applied to orders.
- net_product_revenue: `max(0, product_revenue - refunded_product_amount)`.
- net_shipping_revenue: `max(0, shipping_revenue - refunded_shipping_amount)`.
- net_revenue: `net_product_revenue + net_shipping_revenue`.

## Cost Terms

- cogs: Cost of goods sold from `cost_per_unit * quantity` where cost is available.
- shipping_cost: Carrier costs for the order (explicit or resolved by rules).
- ad_cost: Ad spend allocated to the order or time bucket.
- payment_fee: Payment processor fee (actual if present, otherwise estimated).
- expenses: Recurring expenses allocated by range and shop.

## Profit Terms

- net_profit: `net_revenue - cogs - shipping_cost - ad_cost - payment_fee - expenses`.
- margin: `net_profit / net_revenue` when `net_revenue > 0`, otherwise 0.
- roas: `net_revenue / ad_cost` when `ad_cost > 0`, otherwise null or 0 depending on view.

## Expected Calculation Behavior

- Refunds reduce revenue only (never costs): product refunds reduce product revenue, and shipping refunds reduce shipping revenue.
- Net revenue never goes below zero for product or shipping components (each is clamped at zero).
- Payment fees use actual values when available; otherwise they are estimated using the configured percentage + fixed fee.
- Net profit is computed from net revenue minus COGS, shipping cost, ad cost, payment fee, and allocated expenses.

## Field Mapping (Code)

- Helpers: `src/lib/profit.ts`
- Order breakdown payload: `src/lib/orderProfit.ts` (served by `src/app/api/orders/profit/route.ts`)
- Dashboard series: `src/lib/dashboardSeries.ts`
