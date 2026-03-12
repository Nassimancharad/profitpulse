## ProfitPulse — Shopify public app (Next.js + Prisma)

Public Shopify app that syncs store data and will show product profitability. Stack: Next.js App Router, Prisma + Postgres, Tailwind, Shopify OAuth.

### Prerequisites
- Node + npm
- Postgres with a database (see `DATABASE_URL` format in `.env`)
- Shopify Partner app (public) with API key/secret
- Dev store (e.g., `celaree-test.myshopify.com`)
- HTTPS tunnel reachable by Shopify (Cloudflare tunnel/ngrok/localtunnel)

### Environment
Create `.env` (not committed):
```
DATABASE_URL="postgresql://postgres@localhost:5432/profitpulse?schema=public"
SHOPIFY_API_KEY="..."
SHOPIFY_API_SECRET="..."
SHOPIFY_SCOPES="read_products,read_orders"
SHOPIFY_APP_URL="https://<your-tunnel-host>"
PP_AUTHORIZATION_MODE="shopify_full_access"
MAGIC_LINK_DELIVERY_MODE="preview"
```

### Shopify CLI / tunnel
1) Run your tunnel to port 3000 (e.g., `cloudflared tunnel --url http://localhost:3000`) and note the HTTPS host.
2) Ensure `shopify.app.toml` uses the same host for `application_url` and the redirect.
3) In the Partner Dashboard, set App URL = `<tunnel-host>` and Redirect URL = `<tunnel-host>/api/auth/shopify/callback`.

### Prisma
- Schema defines `Shop`, `Product`, `Order`, `OrderLine`, `AdSpend` with per-shop unique Shopify IDs.
- Generate client: `npx prisma generate`
- Create migration (run yourself): `npx prisma migrate dev --name add-shop-and-relations`

### Vercel + Supabase deployment notes
- Vercel build command: `npm run build` (Next.js App Router).
- Recommended Node.js version: 20.x.
- Use a pooled Supabase connection string for `DATABASE_URL` to avoid exhausting serverless connections.
- Deploy migrations in CI/CD or Vercel deploy step: `npx prisma migrate deploy`.
- Ensure the following env vars are set in Vercel: `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
  `SHOPIFY_SCOPES`, `SHOPIFY_APP_URL`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
- For large syncs, chunk requests: `/api/sync` and `/api/shopify-payments/sync` accept `maxPages`, and
  `/api/meta/sync` enforces a 90-day max range per request.

### Dev server
```
npm install
npm run dev
```
Keep this running while the tunnel forwards to `http://localhost:3000`.

### OAuth flow
- Install URL: `https://<tunnel-host>/api/auth/shopify/install?shop=<your-dev-store>.myshopify.com`
- Install route sets a state cookie and redirects to Shopify’s authorize page.
- Callback: validates state + HMAC, exchanges code for token, upserts `Shop`, then redirects to `/app?shop=...`.

### Access model
- Current default: `PP_AUTHORIZATION_MODE=shopify_full_access` means anyone who can open the app for a shop in Shopify gets full access in ProfitPulse.
- Standalone email login now uses one-time `MagicLinkToken` records tied to `AppUser(provider=email)` plus `ShopMembership`.
- In `shopify_full_access`, Shopify sessions still get admin access for their connected shop; standalone email sessions use the stored membership role.
- In future `PP_AUTHORIZATION_MODE=role_based`, both session types will honor `ShopMembership.role` directly.

### Magic-link login
- Login page: `/login`
- Request endpoint: `POST /api/auth/magic-link/request`
- Verify endpoint: `GET /auth/verify?token=...`
- Logout: `/logout`
- Tokens are cryptographically random, SHA-256 hashed at rest, expire after 20 minutes, and are single-use.
- Development/default delivery mode is `MAGIC_LINK_DELIVERY_MODE=preview`, which returns the link in the UI instead of sending mail.
- Request rate limiting is DB-backed:
  - per email: 5 requests / 15 minutes
  - per IP: 20 requests / 15 minutes
  - verify attempts per IP: 30 / 15 minutes
- Database migrations required for this flow:
  - `20260312153000_add_magic_link_tokens`
  - `20260312170000_add_auth_rate_limit_events`

### Available routes
- `GET /api/auth/shopify/install` — start OAuth (requires `shop` query)
- `GET /api/auth/shopify/callback` — handles Shopify redirect
- `GET /api/auth/session` — verifies Shopify session token (Authorization: Bearer <session_token>)
- `GET /api/prisma-test` — sanity check DB counts
- `GET /api/auth/meta/install` — start Meta OAuth (requires `shop` query, sets state cookie)
- `GET /api/auth/meta/callback` — handles Meta redirect, exchanges token, saves ad accounts
- `POST /api/meta/sync` — fetches Meta insights and stores `AdSpend` (query/body `shop`, optional `start`/`end`)
- `GET /app` — placeholder embedded landing showing the `shop` param
- UI pages: `/dashboard`, `/products`, `/products/[id]`, `/costs`, `/settings`

### Meta Ads integration
- Env vars: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI=https://<tunnel-host>/api/auth/meta/callback`.
- Meta app settings: add `<tunnel-host>` to App Domains and the exact redirect URI to Valid OAuth Redirect URIs; enable Client/Web OAuth Login.
- OAuth: start at `/api/auth/meta/install?shop=<store>.myshopify.com`, approve in Meta, callback stores accessible ad accounts into `MetaAdAccount` with the token.
- Sync: `POST /api/meta/sync?shop=<store>.myshopify.com` (defaults to last 2 years). Optionally pass JSON body `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }`. It deletes + reinserts `AdSpend` for the range per ad account.
- Per-product ad spend: `getAdSpendPerProduct(shopId, start, end)` allocates spend proportionally by revenue for now; dashboard uses this for ROAS/profit.

### Next steps
- Add data sync from Shopify (products/orders) into Prisma.
- Build dashboard/products/cost editor UIs.

### Frontend UI shell
- `src/components/AppShell.tsx` provides the responsive layout: desktop/tablet sidebar, mobile hamburger, and bottom nav with a sticky top bar for title/shop/period/actions.
- Use `AppShell` to wrap pages and pass `title`, optional `subtitle`, `shopLabel`, `periodLabel`, and `actions` (e.g., `SyncNowButton`).
- Current pages wired: `dashboard`, `costs`, `settings` (products pages will be refactored next).
- Styling: Tailwind CSS v4 in `globals.css` with a dark palette (`--pp-bg`, `--pp-surface`, `--pp-foreground`); keep new UI consistent with these tokens.
