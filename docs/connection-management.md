# Connection & Campaign Linking Guide

## Shopify connection
- Connect via `/api/auth/shopify/install?shop=<shop-domain>` (app triggers OAuth).
- To disconnect from this app: POST `/api/auth/shopify/disconnect?shop=<shop-domain>` (removes shop data here). To fully remove the app, uninstall from Shopify Admin.

## Meta Ads connection
- Connect/reconnect via `/api/auth/meta/install?shop=<shop-domain>` (redirects back to `/settings`).
- Disconnect via POST `/api/meta/disconnect?shop=<shop-domain>` (clears Meta ad accounts + cached campaigns for that shop).
- After connecting, use the “Refresh campaigns” button on Product detail to load campaign names.

## Campaign linking on Product detail
- Click “Load/Refresh campaigns” to fetch cached Meta campaigns (or IDs from ad spend if no names cached).
- Toggle checkboxes to link/unlink; press “Save” to hide the list and view the linked summary.
- Linked campaigns persist in `CampaignProduct` records; names come from `MetaCampaign` if available.

## Sync behavior
- The “Sync” button hits `/api/sync?shop=<shop-domain>` then triggers a full page reload so dashboard/product KPIs refresh immediately.
