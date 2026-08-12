import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AddToCartConfirmationStore } from "./confirmation.js";
import { assertTaobaoFamilyUrl, TaobaoBrowser } from "./taobao-browser.js";
import { assertAllowedAction } from "./policy.js";
import type { SelectedSku } from "./types.js";

const browser = new TaobaoBrowser();
const confirmations = new AddToCartConfirmationStore();
const url = z.string().url();
const selections = z.array(z.object({ name: z.string().min(1), value: z.string().min(1) }));
const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const externalWriteAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const probeOnly = process.env.PROBE_ONLY === "true";

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "taobao-shopping-mcp", version: "0.2.0" });
  server.registerTool("taobao_session_status", { description: "Check the current Taobao browser session. Read-only.", annotations: readOnlyAnnotations, inputSchema: {} }, async () => {
    assertAllowedAction("session_status");
    return { content: [{ type: "text", text: JSON.stringify(await browser.sessionStatus()) }] };
  });
  server.registerTool("taobao_search_products", { description: "Search Taobao products without purchasing.", annotations: readOnlyAnnotations, inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(30).optional() } }, async ({ query, limit }) => {
    assertAllowedAction("search_products");
    return { content: [{ type: "text", text: JSON.stringify(await browser.searchProducts(query, limit)) }] };
  });
  server.registerTool("taobao_read_product", { description: "Read a Taobao-family product page, images, and visible SKU information.", annotations: readOnlyAnnotations, inputSchema: { url } }, async ({ url: productUrl }) => {
    assertAllowedAction("read_product");
    return { content: [{ type: "text", text: JSON.stringify(await browser.readProduct(productUrl)) }] };
  });
  server.registerTool("taobao_select_sku", { description: "Select visible product specifications without ordering.", annotations: readOnlyAnnotations, inputSchema: { url, selections } }, async ({ url: productUrl, selections: chosen }) => {
    assertAllowedAction("select_sku");
    return { content: [{ type: "text", text: JSON.stringify(await browser.selectSku(productUrl, chosen)) }] };
  });
  if (!probeOnly) {
    server.registerTool("taobao_confirm_add_to_cart", { description: "Prepare a one-time confirmation token for adding a specific SKU selection to cart. No cart action occurs.", annotations: readOnlyAnnotations, inputSchema: { url, selections } }, async ({ url: productUrl, selections: chosen }) => {
      assertAllowedAction("confirm_add_to_cart");
      assertTaobaoFamilyUrl(productUrl);
      return { content: [{ type: "text", text: JSON.stringify(confirmations.issue(productUrl, chosen)) }] };
    });
    server.registerTool("taobao_add_to_cart", { description: "Add a specifically confirmed SKU selection to Taobao cart, then verify the page success signal. Checkout, payment, ordering, and address changes are unavailable.", annotations: externalWriteAnnotations, inputSchema: { url, selections, confirmationToken: z.string().min(1) } }, async ({ url: productUrl, selections: chosen, confirmationToken }) => {
      assertAllowedAction("add_to_cart");
      if (!confirmations.consume(confirmationToken, productUrl, chosen)) throw new Error("A valid, matching, unexpired one-time confirmation token is required before adding to cart.");
      return { content: [{ type: "text", text: JSON.stringify(await browser.addToCart(productUrl, chosen)) }] };
    });
  }
  return server;
}

async function startStdio(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

async function startHttp(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const configuredHosts = process.env.ALLOWED_HOSTS?.split(",").map((item) => item.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, ...(configuredHosts?.length ? { allowedHosts: configuredHosts } : {}) });
  const transports = new Map<string, StreamableHTTPServerTransport>();
  app.get("/health", (_req: Request, res: Response) => res.status(200).json({ ok: true, service: "taobao-shopping-mcp", transport: "stdio+streamable-http" }));
  app.all("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (req.method !== "POST" || req.body?.method !== "initialize") return res.status(400).json({ error: "MCP initialization is required" });
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => { transports.set(newSessionId, transport!); },
      });
      transport.onclose = () => { if (transport?.sessionId) transports.delete(transport.sessionId); };
      const mcp = createMcpServer();
      await mcp.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  });
  app.listen(port, host, () => console.error(`Taobao shopping MCP HTTP listening on ${host}:${port}`));
}

await Promise.all([startStdio(), startHttp()]);
