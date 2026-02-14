# ProfitPulse Architecture Blueprint

## A) Executive Architecture Summary (1 page)
ProfitPulse is a production-grade SaaS for Shopify profit tracking and analytics that turns raw commerce, ad, and cost data into deterministic, auditable profit numbers at the order, store, and portfolio levels. It solves the common problem of mismatched revenue/profit totals by enforcing a single source of truth for profit math, maintaining clear lineage from inputs to outputs, and reconciling estimates against actuals. The system prioritizes accuracy, completeness, and clarity by separating raw ingestion from derived calculations and by explicitly modeling estimated vs actual values.

**Core architectural choices and why they matter**
- **Single Profit Engine module (server-only) as source of truth**: Eliminates drift between dashboard totals and order-level profit by reusing the same calculations everywhere.
- **Raw vs derived data separation**: Raw ingestion tables are immutable (append-only where feasible), while derived tables/rollups are recomputable, preventing corruption from re-runs.
- **Idempotent ingestion with cursor + upsert semantics**: Prevents duplicates and ensures exactly-once processing, which is critical for finance-like correctness.
- **Explicit estimated vs actual fields + calc warnings**: Communicates confidence clearly and enables reconciliation workflows without hiding uncertainty.
- **Versioned calculation inputs**: Supports future algorithm upgrades without breaking historical numbers; allows re-runs with auditability.
- **Batching + lightweight workers for Vercel limits**: Avoids timeouts and enables scale while remaining compatible with current infrastructure.

## B) High-Level ASCII Diagram
```
[Client/Browser] (trust boundary: client)
        |
        v
[Next.js UI] --(API calls)--> [API Routes] (trust boundary: server)
        |                           |
        |                           v
        |                     [Domain Logic]
        |                           |
        v                           v
[Supabase Auth]                [Supabase Postgres]
        ^                           ^
        |                           |
        +---- Background Workers ----+
               (trust boundary: server)
        |            |             |
        v            v             v
    [Shopify]     [Meta Ads]    [Payments]
 (trust boundary: third-party services)
```

## C) Detailed Component Map (with responsibilities)

### 1) UI Layer (routes/screens)
**Modules**
- Dashboard (portfolio + store)
- Orders profit view (/orders)
- Costs management (/costs)
- Connections + settings

**Responsibilities**
- **Must** render server-provided numbers, filters, and warnings.
- **Should** show estimated vs actual badges and data freshness.
- **Should not** perform profit math or transform raw data beyond display formatting.

**Inputs/Outputs**
- Inputs: API responses (profit summaries, orders, sync status, warnings).
- Outputs: User actions (filters, edits to COGS/rules, connection flows).

**Failure modes**
- Stale or partial data displayed.
- Misinterpretation of estimated values as actual.

**Mitigations**
- Surface `calc_warnings` and `data_freshness` indicators.
- Enforce strict API schemas and response versioning.

### 2) API Layer
**Modules**
- `/api/orders/profit`
- `/api/profit/summary`
- `/api/costs/*`
- `/api/sync/*`

**Responsibilities**
- **Must** validate inputs, enforce auth, and orchestrate domain operations.
- **Should** return consistent calculation version metadata.
- **Should not** implement profit math directly.

**Inputs/Outputs**
- Inputs: Auth context, route params, filter criteria.
- Outputs: Profit summaries, order-level breakdowns, warnings.

**Failure modes**
- Missing env vars or auth misconfiguration.
- Input validation gaps causing mismatched totals.

**Mitigations**
- Startup env validation; Zod validation for all routes.
- Centralized error handler that maps to user-safe errors.

### 3) Domain Layer (Profit Engine + allocation + reconciliation)
**Modules**
- Profit Engine (single source of truth)
- Attribution allocator (ads to orders/stores)
- Fee + refund normalization
- Reconciliation service (estimated vs actual)

**Responsibilities**
- **Must** compute deterministic profit using canonical terms.
- **Should** provide a pure, side-effect-free function for calculations.
- **Should not** write directly to the database (except via repository layer).

**Inputs/Outputs**
- Inputs: Raw orders/line items/refunds, cost rules, ad spend, fees, expenses.
- Outputs: Profit breakdowns at order/store/portfolio levels, warnings.

**Failure modes**
- Double counting refunds or shipping revenue.
- Allocation drift due to time window mismatches.

**Mitigations**
- Comprehensive fixtures and invariants tests (portfolio=sum(stores)).
- Versioned calculation inputs and time-window normalization.

### 4) Data Layer
**Modules**
- Raw tables (orders, line_items, refunds, ad_spend_daily, payment_fees)
- Derived tables (order_profit, store_profit_rollups)
- Constraints + indexes + partitioning strategy

**Responsibilities**
- **Must** maintain data integrity with unique constraints and idempotency keys.
- **Should** separate raw ingestion from derived outputs.
- **Should not** mutate raw records without audit trails.

**Inputs/Outputs**
- Inputs: Ingestion upserts, derived calculation writes.
- Outputs: Queryable, consistent records for API and analytics.

**Failure modes**
- Duplicate orders/fees from retries.
- Derived tables out of sync with raw changes.

**Mitigations**
- Idempotent upserts keyed by (store_id, external_id, source).
- Triggered recalculation pipeline or explicit “recalc jobs” on raw updates.

### 5) Ingestion Layer
**Modules**
- Shopify connector
- Meta ads connector
- Payments fee connector
- Sync cursor management + job scheduler

**Responsibilities**
- **Must** fetch data incrementally and idempotently.
- **Should** batch requests to avoid Vercel timeouts.
- **Should not** run calculations inline during ingestion.

**Inputs/Outputs**
- Inputs: OAuth tokens, sync cursors, job payloads.
- Outputs: Raw data upserts, sync status updates.

**Failure modes**
- API rate limiting causing missed data.
- Partial sync leading to inconsistent dashboard numbers.

**Mitigations**
- Exponential backoff with retry caps, cursor checkpoints, and resumable jobs.
- Post-sync reconciliation job to verify completeness.

### 6) Analytics Layer
**Modules**
- Materialized views/rollups (daily store totals)
- Cache layer (per store/date range)

**Responsibilities**
- **Must** provide fast queries for dashboards and reports.
- **Should** be rebuildable from raw data.
- **Should not** introduce hidden logic different from the Profit Engine.

**Inputs/Outputs**
- Inputs: Derived order-level profit + raw tables.
- Outputs: Aggregated metrics, trend data.

**Failure modes**
- Stale rollups after data corrections.

**Mitigations**
- Invalidation on raw changes; recalc job queue with priorities.

### 7) Observability & Ops
**Modules**
- Structured logging
- Error tracking + alerting
- Health checks + readiness
- Sync lag monitoring

**Responsibilities**
- **Must** surface failures and data freshness.
- **Should** track sync SLA and dashboard error rates.
- **Should not** log PII or secrets.

**Inputs/Outputs**
- Inputs: App logs, job status, sync cursors.
- Outputs: Alerts, dashboards, audit trails.

**Failure modes**
- Silent data drift or job failures.

**Mitigations**
- Alert on missed cron runs and sync lag thresholds.

## D) Data Model Blueprint (production-minded)

**Entities (outline)**
- **users**: id, email, created_at
- **stores**: id, owner_user_id, name, shopify_domain, timezone, currency
- **connections**: id, store_id, provider (shopify/meta/payments), status, auth_metadata, last_synced_at
- **orders**: id, store_id, external_id, order_number, created_at, currency, total_price, total_shipping, total_tax, discount_total
- **line_items**: id, order_id, external_id, product_id, sku, quantity, price, discount
- **refunds**: id, order_id, external_id, created_at, amount_total
- **refund_line_items**: id, refund_id, line_item_id, amount_product
- **refund_shipping**: id, refund_id, amount_shipping
- **ad_spend_daily**: id, store_id, date, platform, spend, currency
- **ad_attribution_allocations**: id, store_id, date, order_id (nullable), allocation_amount, model_version
- **cogs**: id, store_id, product_id/sku, cost_amount, effective_from, effective_to
- **shipping_cost_rules**: id, store_id, rule_type, threshold, cost_amount, effective_from
- **payment_fee_rules**: id, store_id, provider, percentage, fixed_fee, effective_from
- **payment_fee_actuals**: id, store_id, order_id, external_id, fee_amount, currency
- **reconciliations**: id, store_id, type, period_start, period_end, status, diff_amount
- **recurring_expenses**: id, store_id, name, amount, currency, cadence, active
- **jobs**: id, type, payload, status, attempts, run_at
- **sync_cursors**: id, store_id, provider, cursor_value, updated_at
- **calc_warnings**: id, store_id, order_id (nullable), type, message, created_at

**Guidance**
- **Idempotency keys**: `(store_id, provider, external_id)` for raw entities; `(store_id, date, platform)` for ad spend; `(store_id, provider, cursor_value)` for sync checkpoints.
- **Unique constraints**: enforce uniqueness on external IDs per store/provider; ensure one active fee rule per provider + effective window.
- **Soft deletes vs immutable events**: raw ingestion tables should be immutable; corrections should be appended with a new record and an `is_superseded` or `effective_to` pattern. Derived tables can be rebuilt.
- **Multi-store + currency/timezone**: store-level timezone and currency used to normalize all date boundaries; store_id always present in derived tables.
- **Estimated vs actual**: for fees and ad spend allocations, store `amount_estimated` and `amount_actual` with a `confidence` flag; log in `calc_warnings` if only estimates are present.

## E) Profit Engine Design (the “truth layer”)

**Canonical terminology**
- **Gross revenue**: order total before refunds, including shipping revenue.
- **Net revenue**: gross revenue minus refunds (product + shipping).
- **COGS**: cost of goods sold per line item.
- **Shipping cost**: cost from store rules (estimated) or actuals if available.
- **Payment fees**: estimated by rules or actuals when synced.
- **Ad cost**: daily platform spend allocated to stores/orders.
- **Expenses**: recurring costs prorated by day/store.
- **Net profit**: net revenue minus COGS, shipping cost, payment fees, ad cost, expenses.

**Where calculations live**
- Single Profit Engine module in the Domain layer (server-only) used by API and batch jobs.

**On-read vs precomputed**
- **On-read**: order-level profit when viewing a single order (fast with indexed joins).
- **Precomputed**: daily store and portfolio rollups (materialized views or derived tables).

**Consistency strategy**
- Dashboards and order-level endpoints call the same Profit Engine with the same inputs_version.
- Rollups reference the exact inputs_version to avoid drift.

**Versioning calculations**
- `inputs_version` and `algorithm_version` stored on derived outputs (order_profit, rollups).
- Recalculation pipeline can regenerate historical outputs when version increments.

**Testing strategy**
- Golden fixtures covering refunds, shipping, ad allocation, multi-store.
- Invariants: portfolio sum equals sum of stores; net revenue = gross - refunds.
- Regression tests that compare precomputed rollups vs on-read calculations.

## F) Ingestion & Sync Best Practices

**Shopify sync**
- Use incremental sync by `updated_at` cursor + pagination.
- Use webhooks for near-real-time updates; polling for backfill or webhook gaps.
- Store refund line items explicitly to avoid double counting.

**Meta spend sync**
- Pull daily spend with a rolling window (e.g., last 7–14 days) to handle attribution lag.
- Mark incomplete days as `estimated` until final spend is settled.

**Payments fee sync & reconciliation**
- Use payout-level sync where available and map to orders; store adjustments separately (chargebacks, disputes).
- Reconcile estimated fees with actuals; store differences in `reconciliations`.

**Rate limiting + retries**
- Exponential backoff with jitter; max attempts and dead-letter queue for failures.
- Use circuit breaker when sustained failures are detected.

**Job batching**
- Batch by store and date range; keep batch size within Vercel execution limits.
- Use job chaining for large backfills.

**Exactly-once semantics**
- Use idempotent upserts with unique keys; all jobs must be retry-safe.

## G) Scalability Plan (future in mind)

**100k+ orders/store**
- Introduce partitioning by store/date for raw orders and order_profit.
- Materialize daily rollups to avoid scanning large tables.

**Many stores per user**
- Portfolio rollups precomputed; cache per user/date range.

**Multiple ad platforms**
- Normalize spend into `ad_spend_daily` with a `platform` field.
- Attribution engine supports pluggable models.

**Near-real-time dashboards**
- Use webhooks + immediate incremental recalculation for recent data windows.
- Invalidate cache for impacted store/date ranges.

**Migration path**
- **Compute-on-read → rollups**: start with on-read for small stores, add rollups for large.
- **Vercel Cron → dedicated workers**: move batch processing to queue-based workers when load grows.
- **Single-region → multi-region**: read replicas and edge caching for dashboards.
- **Caching strategy**: cache by store + date range + inputs_version; invalidate on raw updates.

## H) Security & Compliance Posture (practical)

- **Secrets management**: all API keys in server-only env vars; never exposed in client bundles.
- **Least privilege DB access**: separate service role for server-only ops; row-level security for user access.
- **Cron endpoint auth**: use `CRON_SECRET` and allowlist Vercel Cron IPs if supported.
- **PII handling**: store minimal customer data; redact emails in logs.
- **Audit logging**: record rule changes (COGS, fee rules) with user_id and timestamp.
- **Safe logging**: structured logs without tokens or sensitive payloads.

## I) Operational Checklist (production readiness)

- **Env var validation at startup**: fail fast if SHOPIFY, META, SUPABASE keys missing.
- **Health endpoints**: `/api/health` returns DB connectivity + sync lag.
- **Post-deploy checks**: Playwright flows for login, dashboard load, orders profit page.
- **Incident playbook**:
  - If dashboard fails: roll back to previous deploy, disable rollups if necessary, switch to on-read.
  - If sync lag spikes: pause new jobs, investigate provider API limits, requeue with reduced batch size.
- **Backup/restore**: nightly Supabase backups + monthly restore test.
- **Monitoring signals**: cron success rate, sync lag by provider, job retries, dashboard error rate, reconciliation diffs.

## J) Implementation Roadmap (phased, with verification gates)

### Phase 1: Stabilize architecture + eliminate duplicated calculations + post-deploy checks
**Deliverables**
- Single Profit Engine module used across API and rollups.
- Strict env validation and API schema validation.
- Playwright post-deploy checks for critical routes.

**Definition of Done**
- Order profit totals match dashboard totals for golden fixtures.
- No duplicate calculation paths in codebase.

**Acceptance checks**
- Automated tests for profit math fixtures.
- Manual verification: compare order total vs dashboard total for a test store.

### Phase 2: Performance & scale (rollups, caching, job queue)
**Deliverables**
- Daily store rollups with inputs_version.
- Cache by store/date range + invalidation on raw updates.
- Job queue with batching and retry visibility.

**Definition of Done**
- Dashboard loads under target SLA for large stores.
- Sync backfills complete without timeouts.

**Acceptance checks**
- Load test on 100k orders dataset.
- Verify rollups match on-read calculations within tolerance.

### Phase 3: Advanced integrations & reconciliation
**Deliverables**
- Additional ad platforms (Google/TikTok).
- Fee reconciliation pipeline with actuals vs estimates.
- Expanded calc_warnings with confidence scoring.

**Definition of Done**
- Reconciliation coverage for payment fees and ad spend.
- Multi-platform attribution model with versioning.

**Acceptance checks**
- Regression tests for all attribution models.
- Manual reconciliation check for a known payout period.

## K) Current Repo Mapping + Gap Analysis

### Repo mapping (as implemented today)

| Architecture area | Repo locations | Notes |
| --- | --- | --- |
| UI layer | `src/app/dashboard/page.tsx`, `src/app/costs/page.tsx`, `src/app/connections/page.tsx`, `src/app/products/page.tsx`, `src/app/settings/page.tsx`, `src/app/preferences/page.tsx` | Next.js App Router screens for dashboard, costs, connections, product view, settings, preferences. |
| API layer | `src/app/api/orders/profit/route.ts`, `src/app/api/costs/route.ts`, `src/app/api/expenses/route.ts`, `src/app/api/sync/route.ts`, `src/app/api/meta/sync/route.ts`, `src/app/api/shopify-payments/sync/route.ts`, `src/app/api/auth/**` | API routes for order profit, cost updates, expense CRUD, Shopify/Meta sync, payment fee sync, and OAuth/session endpoints. |
| Domain layer (profit + allocation) | `src/lib/profit.ts`, `src/lib/orderProfit.ts`, `src/lib/dashboardSeries.ts`, `src/lib/adAttribution.ts`, `src/lib/paymentFees.ts`, `src/lib/shippingCost.ts`, `src/lib/expenses.ts`, `src/lib/portfolioAdSpend.ts` | Profit math, order-level breakdowns, dashboard rollups, ad spend allocation, shipping fee resolution, and expense allocation. |
| Data layer | `prisma/schema.prisma`, `prisma/migrations/**` | Postgres schema for shops, products, orders, order lines, ad spend, fee config, expenses, and shipping rules. |
| Ingestion/sync layer | `src/app/api/sync/route.ts`, `src/app/api/meta/sync/route.ts`, `src/app/api/shopify-payments/sync/route.ts`, `src/lib/shopifyAdmin.ts`, `src/lib/meta.ts` | Shopify orders/products sync, Meta spend sync, and Shopify Payments fee sync. |
| Analytics/rollups | `src/lib/dashboardSeries.ts`, `src/lib/portfolioAdSpend.ts` | On-read aggregation for dashboard series and portfolio ad spend; no materialized views. |
| Auth/session | `src/app/api/auth/**`, `src/lib/shopifySession.ts` | Shopify and Meta OAuth routes; session token verification for Shopify. |

### Gaps vs the target architecture

1) **Single Profit Engine as the only source of truth**
   - Current implementation splits profit logic across `profit.ts`, `orderProfit.ts`, and `dashboardSeries.ts`, so there are multiple calculation paths instead of one canonical engine.  
     **Impact:** risk of drift between dashboard totals and order-level profit if changes land in only one place.  

2) **Raw vs derived separation + precomputed rollups**
   - Prisma schema models raw entities (shops, orders, order lines, ad spend) but there are no derived tables such as `order_profit` or daily rollups; dashboard calculations are computed on-read.  
     **Impact:** no recomputable derived layer or cached rollups for scale.

3) **Idempotent ingestion with cursors + job scheduler**
   - Sync endpoints directly fetch and upsert without storing cursor checkpoints or job records (no `sync_cursors` or `jobs` tables).  
     **Impact:** limited retry visibility and no resumable background jobs.

4) **Estimated vs actual fields + calc warnings**
   - The schema has `paymentFeeActual` but no generalized `estimated` vs `actual` fields for costs/ad spend or `calc_warnings` storage.  
     **Impact:** no standardized confidence reporting across costs and allocations.

5) **Versioned calculation inputs**
   - No `inputs_version` or `algorithm_version` fields are present in schema or API responses.  
     **Impact:** historical numbers cannot be re-derived reliably after algorithm changes.

6) **Observability + operational endpoints**
   - No `/api/health` or structured logging/alerting integrations are present in the API routes.  
     **Impact:** missing readiness checks and sync lag visibility.

7) **Supabase Auth/RLS**
   - The blueprint references Supabase Auth, but the repo currently uses Shopify session token verification and Prisma models only.  
     **Impact:** the auth stack differs from the documented trust boundary model.

8) **Reconciliation services**
   - There is no reconciliation pipeline or tables for fee/ad reconciliation status beyond raw values.  
     **Impact:** no systematized estimated-vs-actual reconciliation workflow.
