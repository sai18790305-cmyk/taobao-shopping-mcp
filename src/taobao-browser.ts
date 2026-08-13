import { chromium, type BrowserContext, type Page } from "playwright";
import { resolveChromeExecutable, resolveProfileDirectory } from "./local-config.js";
import type { AddToCartResult, ProductDetail, ProductSummary, SelectedSku, SessionStatus } from "./types.js";

const TAOBAO_HOME = "https://www.taobao.com/";
const SEARCH_URL = "https://s.taobao.com/search?q=";
const ALLOWED_HOSTS = new Set(["taobao.com", "tmall.com"]);
export const DEFAULT_BROWSER_IDLE_MS = 5 * 60 * 1000;

type TimerHandle = ReturnType<typeof setTimeout>;
type TimerScheduler = {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

const defaultTimerScheduler: TimerScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export function resolveBrowserIdleMs(value = process.env.TAOBAO_BROWSER_IDLE_MS): number {
  if (value === undefined || value.trim() === "") return DEFAULT_BROWSER_IDLE_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BROWSER_IDLE_MS;
}

export class BrowserIdleCloser {
  private timer?: TimerHandle;

  constructor(
    private readonly idleMs: number,
    private readonly closeBrowser: () => Promise<void>,
    private readonly scheduler: TimerScheduler = defaultTimerScheduler,
  ) {}

  arm(): void {
    this.cancel();
    if (this.idleMs === 0) return;
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      void this.closeBrowser();
    }, this.idleMs);
    this.timer.unref?.();
  }

  cancel(): void {
    if (this.timer !== undefined) this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export function isTaobaoFamilyUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return [...ALLOWED_HOSTS].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function assertTaobaoFamilyUrl(value: string): void {
  if (!isTaobaoFamilyUrl(value)) throw new Error(`Navigation blocked: only Taobao-family domains are allowed (${value})`);
}

export class TaobaoBrowser {
  private context?: BrowserContext;
  private page?: Page;
  private connecting?: Promise<void>;
  private closing?: Promise<void>;
  private activeCalls = 0;
  private readonly idleCloser = new BrowserIdleCloser(resolveBrowserIdleMs(), () => this.close());

  private async connect(): Promise<void> {
    await this.closing;
    if (this.context) return;

    if (this.connecting) {
      return this.connecting;
    }

    const connecting = this.launch();
    this.connecting = connecting;

    try {
      await connecting;
    } finally {
      if (this.connecting === connecting) this.connecting = undefined;
    }
  }

  private async launch(): Promise<void> {
    const profile = resolveProfileDirectory();
    this.context = await chromium.launchPersistentContext(profile, {
      executablePath: resolveChromeExecutable(),
      headless: process.env.HEADLESS === "true",
      viewport: { width: 1440, height: 1000 },
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--renderer-process-limit=1",
      ],
    });
    const [primaryPage, ...extraPages] = this.context.pages();
    this.page = primaryPage ?? await this.context.newPage();
    await Promise.all(extraPages.map((page) => page.close().catch(() => undefined)));
    this.context.on("page", (page) => {
      if (page !== this.page) void page.close().catch(() => undefined);
    });
  }

  private get currentPage(): Page {
    if (!this.page) throw new Error("Browser is not connected");
    return this.page;
  }

  async close(): Promise<void> {
    this.idleCloser.cancel();
    if (this.closing) return this.closing;
    const context = this.context;
    this.context = undefined;
    this.page = undefined;
    if (!context) return;
    const closing = context.close().finally(() => {
      if (this.closing === closing) this.closing = undefined;
    });
    this.closing = closing;
    return closing;
  }

  private async withBrowser<T>(operation: (page: Page) => Promise<T>): Promise<T> {
    this.idleCloser.cancel();
    this.activeCalls += 1;
    try {
      await this.connect();
      return await operation(this.currentPage);
    } finally {
      this.activeCalls -= 1;
      if (this.activeCalls === 0 && this.context) this.idleCloser.arm();
    }
  }

  async sessionStatus(): Promise<SessionStatus> {
    try {
      return await this.withBrowser(async (page) => {
        try {
          await page.goto(TAOBAO_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });
          const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
          const title = await page.title();
          const url = page.url();
          const loginWall = /登录|请登录|扫码登录|验证码|验证你是人类/.test(text);
          const account = await page.locator("[class*='user'], [class*='nick'], [class*='account']").first().innerText().catch(() => undefined);
          return { loggedIn: !loginWall, accountLabel: account?.trim() || undefined, url, title };
        } catch (error) {
          return { loggedIn: false, url: page.url(), title: await page.title(), blocked: true, message: String(error) };
        }
      });
    } catch (error) {
      return { loggedIn: false, url: TAOBAO_HOME, title: "", blocked: true, message: `Browser runtime unavailable: ${String(error)}` };
    }
  }

  async searchProducts(query: string, limit = 10): Promise<ProductSummary[]> {
    return this.withBrowser(async (page) => {
      await page.goto(`${SEARCH_URL}${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      const cards = page.locator("[data-item-id], .doubleCardWrapper, [class*='Card']");
      const count = Math.min(await cards.count(), limit);
      const results: ProductSummary[] = [];
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const title = (await card.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        const link = await card.locator("a").first().getAttribute("href").catch(() => null);
        if (!title || !link) continue;
        const imageUrl = await card.locator("img").first().getAttribute("src").catch(() => undefined) ?? undefined;
        results.push({ id: extractId(link), title, imageUrl: normalizeUrl(imageUrl), url: normalizeUrl(link) ?? link });
      }
      return results;
    });
  }

  async readProduct(url: string): Promise<ProductDetail> {
    assertTaobaoFamilyUrl(url);
    return this.withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(900);
      const body = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
      const title = (await page.locator("h1, [class*='title']").first().innerText().catch(() => "")).trim();
      const images = await page.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src).filter(Boolean).slice(0, 20));
      const skuNames = await page.locator("[class*='sku'], [class*='Sku']").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()).filter(Boolean).slice(0, 20));
      return { id: extractId(url), title, images: [...new Set(images)], skus: skuNames.map((name) => ({ name, values: [] })), url, price: body.match(/(?:¥|￥)\s*[\d.]+/)?.[0] };
    });
  }

  async selectSku(url: string, selections: SelectedSku[]): Promise<{ selected: SelectedSku[]; ready: boolean }> {
    assertTaobaoFamilyUrl(url);
    return this.withBrowser((page) => this.selectSkuOnPage(page, url, selections));
  }

  private async selectSkuOnPage(page: Page, url: string, selections: SelectedSku[]): Promise<{ selected: SelectedSku[]; ready: boolean }> {
    if (page.url() !== url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    for (const selection of selections) {
      const option = page.getByText(selection.value, { exact: true }).first();
      if (!(await option.count())) throw new Error(`SKU value not found: ${selection.name}=${selection.value}`);
      await option.click();
    }
    return { selected: selections, ready: true };
  }

  async addToCart(url: string, selections: SelectedSku[]): Promise<AddToCartResult> {
    assertTaobaoFamilyUrl(url);
    return this.withBrowser(async (page) => {
      await this.selectSkuOnPage(page, url, selections);
      const button = page.getByText(/加入购物车|加购/, { exact: false }).first();
      if (!(await button.count())) throw new Error("Add-to-cart control not found");
      await button.click();
      await page.waitForTimeout(600);
      const pageText = await page.locator("body").innerText().catch(() => "");
      const verified = /加入购物车成功|已加入购物车|添加成功/.test(pageText);
      return { executed: true, added: verified, verified, verification: verified ? "success_signal_detected" : "no_success_signal", url: page.url() };
    });
  }
}

function extractId(url: string): string {
  return url.match(/(?:id=|item\.taobao\.com\/item\.htm\?id=)(\d+)/)?.[1] ?? url;
}

function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `https://item.taobao.com${url}` : url;
}
