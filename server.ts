import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TaobaoBrowser } from "./taobao-browser.js";
import { assertAllowedAction } from "./policy.js";

const browser = new TaobaoBrowser();
const server = new McpServer({ name: "taobao-shopping-mcp", version: "0.1.0" });
const url = z.string().url();
const selections = z.array(z.object({ name: z.string().min(1), value: z.string().min(1) }));

server.registerTool("taobao_session_status", { description: "Check the current Taobao browser session. Read-only.", inputSchema: {} }, async () => {
  assertAllowedAction("session_status");
  return { content: [{ type: "text", text: JSON.stringify(await browser.sessionStatus()) }] };
});
server.registerTool("taobao_search_products", { description: "Search Taobao products without purchasing.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(30).optional() } }, async ({ query, limit }) => {
  assertAllowedAction("search_products");
  return { content: [{ type: "text", text: JSON.stringify(await browser.searchProducts(query, limit)) }] };
});
server.registerTool("taobao_read_product", { description: "Read a product page, images, and visible SKU information.", inputSchema: { url } }, async ({ url: productUrl }) => {
  assertAllowedAction("read_product");
  return { content: [{ type: "text", text: JSON.stringify(await browser.readProduct(productUrl)) }] };
});
server.registerTool("taobao_select_sku", { description: "Select visible product specifications without ordering.", inputSchema: { url, selections } }, async ({ url: productUrl, selections: chosen }) => {
  assertAllowedAction("select_sku");
  return { content: [{ type: "text", text: JSON.stringify(await browser.selectSku(productUrl, chosen)) }] };
});
server.registerTool("taobao_add_to_cart", { description: "Select specifications and add a product to Taobao cart. Never checks out.", inputSchema: { url, selections } }, async ({ url: productUrl, selections: chosen }) => {
  assertAllowedAction("add_to_cart");
  return { content: [{ type: "text", text: JSON.stringify(await browser.addToCart(productUrl, chosen)) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
