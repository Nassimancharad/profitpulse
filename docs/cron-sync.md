# Cron Sync (Manual Triggers)

These endpoints are protected by deployment protection and the cron secret.
Use both headers when calling from a local terminal.

## Environment prerequisites
- `CRON_SECRET` set in Vercel (used as `Authorization: Bearer <secret>`).
- Deployment protection bypass token (Vercel Project → Settings → Security).

## Shopify cron (all shops)
```bash
curl \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "x-vercel-protection-bypass: <BYPASS_TOKEN>" \
  https://<your-domain>/api/cron/shopify
```

## Meta cron (shops with Meta accounts)
```bash
curl \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "x-vercel-protection-bypass: <BYPASS_TOKEN>" \
  https://<your-domain>/api/cron/meta
```

## Meta cron with date range
```bash
curl \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "x-vercel-protection-bypass: <BYPASS_TOKEN>" \
  "https://<your-domain>/api/cron/meta?start=YYYY-MM-DD&end=YYYY-MM-DD"
```
