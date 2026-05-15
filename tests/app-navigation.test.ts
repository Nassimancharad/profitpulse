import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmbeddedAppHref, resolveActiveAppHref } from "../src/lib/appNavigation";

test("resolveActiveAppHref maps nested app routes to nav items", () => {
  assert.equal(resolveActiveAppHref("/dashboard"), "/dashboard");
  assert.equal(resolveActiveAppHref("/products/123"), "/products");
  assert.equal(resolveActiveAppHref("/products-old"), null);
  assert.equal(resolveActiveAppHref("/"), null);
  assert.equal(resolveActiveAppHref(null), null);
});

test("buildEmbeddedAppHref preserves shop and embedded context", () => {
  const href = buildEmbeddedAppHref(
    "/settings",
    new URLSearchParams("shop=demo.myshopify.com&host=stale-host"),
    { host: "embedded-host", embedded: "1" },
  );

  assert.equal(href, "/settings?shop=demo.myshopify.com&host=embedded-host&embedded=1");
});
