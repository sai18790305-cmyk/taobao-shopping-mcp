import { TaobaoBrowser } from "./taobao-browser.js";

const browser = new TaobaoBrowser();
const query = process.argv.slice(2).join(" ") || "2mm 深绿色米珠";
try {
  const session = await browser.sessionStatus();
  const report: Record<string, unknown> = { environment: { headless: process.env.HEADLESS !== "false", profile: process.env.TAOBAO_PROFILE_DIR ?? ".taobao-profile" }, session };
  if (session.blocked || !session.loggedIn) {
    report.result = "blocked_before_product_probe";
    report.next = "Run this probe in a browser environment with Taobao reachable and an already authenticated profile.";
  } else {
    const products = await browser.searchProducts(query, 3);
    report.search = { query, count: products.length, products };
    if (products[0]) report.product = await browser.readProduct(products[0].url);
    report.result = products[0] ? "partial_read_probe" : "no_products";
    report.safety = "No checkout, payment, order, or address operation exists in this probe.";
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
