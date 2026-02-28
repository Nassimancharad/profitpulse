import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEmbeddedAppContextToSearchParams,
  isEmbeddedAppContext,
  resolveEmbeddedAppContext,
} from "../src/lib/embeddedAppContext";

test("resolveEmbeddedAppContext falls back to cookies when search params are missing", () => {
  const context = resolveEmbeddedAppContext({
    searchParams: new URLSearchParams("shop=demo.myshopify.com"),
    cookieHeader: "pp_embedded_host=abc123; pp_embedded=1",
  });

  assert.equal(context.host, "abc123");
  assert.equal(context.embedded, "1");
  assert.equal(isEmbeddedAppContext(context), true);
});

test("resolveEmbeddedAppContext prioritizes explicit query params over cookies", () => {
  const context = resolveEmbeddedAppContext({
    searchParams: new URLSearchParams("host=query-host&embedded=1"),
    cookieHeader: "pp_embedded_host=cookie-host; pp_embedded=0",
  });

  assert.equal(context.host, "query-host");
  assert.equal(context.embedded, "1");
});

test("applyEmbeddedAppContextToSearchParams appends embedded fields", () => {
  const params = new URLSearchParams("shop=demo.myshopify.com");
  applyEmbeddedAppContextToSearchParams(params, {
    host: "embedded-host",
    embedded: "1",
  });

  assert.equal(params.get("shop"), "demo.myshopify.com");
  assert.equal(params.get("host"), "embedded-host");
  assert.equal(params.get("embedded"), "1");
});
