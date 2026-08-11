import { chromium, type BrowserContext, type Page } from "playwright";
import type { ProductDetail, ProductSummary, SelectedSku, SessionStatus } from "./types.js";

const TAOBAO_HOME = "https://www.taobao.com/";
const SEARCH_URL = "https://s.taobao.com/search?q=";

export class TaobaoBrowser {
  private context?: BrowserContext;
  private page?: Page;

  async connect(): Promise<void> {
    if (this.context) return;
    const profile = process.env.TAOBAO_PROFILE_DIR ?? ".taobao-profile";
    this.context = await chromium.launchPersistentContext(profile, {
      headless: process.env.HEADLESS !== "false",
      viewport: { width: 1440, height: 1000 },
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
  }

  private get currentPage(): Page {
    if (!this.page) throw new Error("Browser is not connected");
    return this.page;
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }

  async sessionStatus(): Promise<SessionStatus> {
    try {
      await this.connect();
    } catch (error) {
      return { loggedIn: false, url: TAOBAO_HOME, title: "", blocked: true, message: `Browser runtime unavailable: ${String(error)}` };
    }
    try {
      await this.currentPage.goto(TAOBAO_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });
      const text = await this.currentPage.locator("body").innerText({ timeout: 10000 }).catch(() => "");
      const title = await this.currentPage.title();
      const url = this.currentPage.url();
      const loginWall = /登录|请登录|扫码登录|验证码|验证你是人类/.test(text);
      const account = await this.currentPage.locator("[class*='user'], [class*='nick'], [class*='account']").first().innerText().catch(() => undefined);
      return { loggedIn: !loginWall, accountLabel: account?.trim() || undefined, url, title };
    } catch (error) {
      return { loggedIn: false, url: this.currentPage.url(), title: await this.currentPage.title(), blocked: true, message: String(error) };
    }
  }

  async searchProducts(query: string, limit = 10): Promise<ProductSummary[]> {
    await this.connect();
    await this.currentPage.goto(`${SEARCH_URL}${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.currentPage.waitForTimeout(1200);
    const cards = this.currentPage.locator("[data-item-id], .doubleCardWrapper, [class*='Card']");
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
  }

  async readProduct(url: string): Promise<ProductDetail> {
    await this.connect();
    await this.currentPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.currentPage.waitForTimeout(900);
    const body = await this.currentPage.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    const title = (await this.currentPage.locator("h1, [class*='title']").first().innerText().catch(() => "")).trim();
    const images = await this.currentPage.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src).filter(Boolean).slice(0, 20));
    const skuNames = await this.currentPage.locator("[class*='sku'], [class*='Sku']").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()).filter(Boolean).slice(0, 20));
    return { id: extractId(url), title, images: [...new Set(images)], skus: skuNames.map((name) => ({ name, values: [] })), url, price: body.match(/(?:¥|￥)\s*[\d.]+/)?.[0] };
  }

  async selectSku(url: string, selections: SelectedSku[]): Promise<{ selected: SelectedSku[]; ready: boolean }> {
    await this.connect();
    if (this.currentPage.url() !== url) await this.currentPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    for (const selection of selections) {
      const option = this.currentPage.getByText(selection.value, { exact: true }).first();
      if (!(await option.count())) throw new Error(`SKU value not found: ${selection.name}=${selection.value}`);
      await option.click();
    }
    return { selected: selections, ready: true };
  }

  async addToCart(url: string, selections: SelectedSku[]): Promise<{ added: boolean; url: string }> {
    await this.selectSku(url, selections);
    const button = this.currentPage.getByText(/加入购物车|加购/, { exact: false }).first();
    if (!(await button.count())) throw new Error("Add-to-cart control not found");
    await button.click();
    await this.currentPage.waitForTimeout(600);
    return { added: true, url: this.currentPage.url() };
  }
}

function extractId(url: string): string {
  return url.match(/(?:id=|item\.taobao\.com\/item\.htm\?id=)(\d+)/)?.[1] ?? url;
}

function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith("//") ? `https:${url}` : url.startsWith("/") ? `https://item.taobao.com${url}` : url;
}
