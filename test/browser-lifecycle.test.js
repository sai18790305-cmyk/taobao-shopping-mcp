import test from "node:test";
import assert from "node:assert/strict";
import { BrowserIdleCloser, DEFAULT_BROWSER_IDLE_MS, resolveBrowserIdleMs } from "../dist/taobao-browser.js";

class FakeScheduler {
  now = 0;
  nextId = 1;
  timers = new Map();

  setTimeout(callback, delayMs) {
    const handle = { id: this.nextId++, unref() {} };
    this.timers.set(handle.id, { callback, dueAt: this.now + delayMs });
    return handle;
  }

  clearTimeout(handle) {
    this.timers.delete(handle.id);
  }

  advanceBy(milliseconds) {
    this.now += milliseconds;
    const due = [...this.timers.entries()].filter(([, timer]) => timer.dueAt <= this.now);
    for (const [id, timer] of due) {
      this.timers.delete(id);
      timer.callback();
    }
  }
}

test("browser idle timeout defaults to five minutes and validates overrides", () => {
  assert.equal(DEFAULT_BROWSER_IDLE_MS, 300_000);
  assert.equal(resolveBrowserIdleMs(undefined), 300_000);
  assert.equal(resolveBrowserIdleMs("1"), 1);
  assert.equal(resolveBrowserIdleMs("0"), 0);
  assert.equal(resolveBrowserIdleMs("-1"), 300_000);
  assert.equal(resolveBrowserIdleMs("invalid"), 300_000);
});

test("idle close fires exactly at the timeout boundary", () => {
  const scheduler = new FakeScheduler();
  let closes = 0;
  const closer = new BrowserIdleCloser(300_000, async () => { closes += 1; }, scheduler);
  closer.arm();
  scheduler.advanceBy(299_999);
  assert.equal(closes, 0);
  scheduler.advanceBy(1);
  assert.equal(closes, 1);
});

test("new activity resets the idle boundary and zero disables it", () => {
  const scheduler = new FakeScheduler();
  let closes = 0;
  const closer = new BrowserIdleCloser(100, async () => { closes += 1; }, scheduler);
  closer.arm();
  scheduler.advanceBy(99);
  closer.arm();
  scheduler.advanceBy(99);
  assert.equal(closes, 0);
  scheduler.advanceBy(1);
  assert.equal(closes, 1);

  const disabled = new BrowserIdleCloser(0, async () => { closes += 1; }, scheduler);
  disabled.arm();
  scheduler.advanceBy(1_000);
  assert.equal(closes, 1);
});
