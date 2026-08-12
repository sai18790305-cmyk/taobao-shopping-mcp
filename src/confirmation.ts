import { randomBytes } from "node:crypto";
import type { AddToCartConfirmation, SelectedSku } from "./types.js";

type PendingConfirmation = AddToCartConfirmation & { expiresAtMs: number };

export class AddToCartConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();
  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  issue(productUrl: string, selections: SelectedSku[]): AddToCartConfirmation {
    const token = randomBytes(24).toString("base64url");
    const expiresAtMs = Date.now() + this.ttlMs;
    const confirmation = { token, productUrl, selections, expiresAt: new Date(expiresAtMs).toISOString() };
    this.pending.set(token, { ...confirmation, expiresAtMs });
    return confirmation;
  }

  consume(token: string, productUrl: string, selections: SelectedSku[]): boolean {
    const item = this.pending.get(token);
    this.pending.delete(token);
    if (!item || item.expiresAtMs <= Date.now()) return false;
    return item.productUrl === productUrl && JSON.stringify(item.selections) === JSON.stringify(selections);
  }

  size(): number {
    return this.pending.size;
  }
}
