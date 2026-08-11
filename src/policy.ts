export const ALLOWED_ACTIONS = [
  "session_status",
  "search_products",
  "read_product",
  "select_sku",
  "confirm_add_to_cart",
  "add_to_cart",
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

export const FORBIDDEN_ACTIONS = [
  "checkout",
  "place_order",
  "pay",
  "change_address",
  "delete_cart_item",
] as const;

export function assertAllowedAction(action: string): asserts action is AllowedAction {
  if (!ALLOWED_ACTIONS.includes(action as AllowedAction)) {
    throw new Error(`Action is not enabled: ${action}. Checkout, payment, order, and address actions are disabled.`);
  }
}
