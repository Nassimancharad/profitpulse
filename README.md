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
```

### Shopify CLI / tunnel
1) Run your tunnel to port 3000 (e.g., `cloudflared tunnel --url http://localhost:3000`) and note the HTTPS host.
2) Ensure `shopify.app.toml` uses the same host for `application_url` and the redirect.
3) In the Partner Dashboard, set App URL = `<tunnel-host>` and Redirect URL = `<tunnel-host>/api/auth/shopify/callback`.

### Prisma
- Schema defines `Shop`, `Product`, `Order`, `OrderLine`, `AdSpend` with per-shop unique Shopify IDs.
- Generate client: `npx prisma generate`
- Create migration (run yourself): `npx prisma migrate dev --name add-shop-and-relations`

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

### Available routes
- `GET /api/auth/shopify/install` — start OAuth (requires `shop` query)
- `GET /api/auth/shopify/callback` — handles Shopify redirect
- `GET /api/auth/session` — verifies Shopify session token (Authorization: Bearer <session_token>)
- `GET /api/prisma-test` — sanity check DB counts
- `GET /app` — placeholder embedded landing showing the `shop` param
- UI pages: `/dashboard`, `/products`, `/products/[id]`, `/costs`, `/settings`

### Next steps
- Add data sync from Shopify (products/orders) into Prisma.
- Build dashboard/products/cost editor UIs.

### Frontend UI shell
- `src/components/AppShell.tsx` provides the responsive layout: desktop/tablet sidebar, mobile hamburger, and bottom nav with a sticky top bar for title/shop/period/actions.
- Use `AppShell` to wrap pages and pass `title`, optional `subtitle`, `shopLabel`, `periodLabel`, and `actions` (e.g., `SyncNowButton`).
- Current pages wired: `dashboard`, `costs`, `settings` (products pages will be refactored next).
- Styling: Tailwind CSS v4 in `globals.css` with a dark palette (`--pp-bg`, `--pp-surface`, `--pp-foreground`); keep new UI consistent with these tokens.
