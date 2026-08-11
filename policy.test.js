import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_ACTIONS, assertAllowedAction } from "../dist/policy.js";

test("probe actions are explicitly allowlisted", () => {
  assert.deepEqual(ALLOWED_ACTIONS, ["session_status", "search_products", "read_product", "select_sku", "add_to_cart"]);
});

test("checkout/payment/order/address actions are rejected", () => {
  for (const action of ["checkout", "pay", "place_order", "change_address"]) {
    assert.throws(() => assertAllowedAction(action), /not enabled/);
  }
});
