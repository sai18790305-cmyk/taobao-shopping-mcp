import test from "node:test";
import assert from "node:assert/strict";
import { AddToCartConfirmationStore } from "../dist/confirmation.js";
import { assertTaobaoFamilyUrl, isTaobaoFamilyUrl } from "../dist/taobao-browser.js";

test("navigation only accepts Taobao-family domains", () => {
  assert.equal(isTaobaoFamilyUrl("https://www.taobao.com/"), true);
  assert.equal(isTaobaoFamilyUrl("https://item.taobao.com/item.htm?id=1"), true);
  assert.equal(isTaobaoFamilyUrl("https://detail.tmall.com/item.htm?id=1"), true);
  assert.equal(isTaobaoFamilyUrl("https://example.com/item"), false);
  assert.throws(() => assertTaobaoFamilyUrl("https://example.com/item"), /Navigation blocked/);
});

test("add-to-cart confirmation tokens are matching and one-time", () => {
  const store = new AddToCartConfirmationStore(60_000);
  const selections = [{ name: "颜色", value: "深绿" }];
  const issued = store.issue("https://item.taobao.com/item.htm?id=1", selections);
  assert.equal(store.consume(issued.token, issued.productUrl, selections), true);
  assert.equal(store.consume(issued.token, issued.productUrl, selections), false);
  const other = store.issue(issued.productUrl, selections);
  assert.equal(store.consume(other.token, "https://item.taobao.com/item.htm?id=2", selections), false);
});

test("expired confirmation tokens are rejected", () => {
  const store = new AddToCartConfirmationStore(0);
  const issued = store.issue("https://item.taobao.com/item.htm?id=1", []);
  assert.equal(store.consume(issued.token, issued.productUrl, []), false);
});
