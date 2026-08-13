import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server annotates tools and hides cart writes in probe-only mode", async () => {
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /readOnlyHint: true/);
  assert.match(source, /taobao_select_sku[\s\S]*?annotations: externalWriteAnnotations/);
  assert.match(source, /taobao_confirm_add_to_cart[\s\S]*?annotations: externalWriteAnnotations/);
  assert.match(source, /taobao_add_to_cart[\s\S]*?annotations: externalWriteAnnotations/);
  assert.match(source, /if \(!probeOnly\)/);
  assert.match(source, /process\.env\.PROBE_ONLY === "true"/);
});

test("HTTP MCP is loopback-only and closes browser resources on exit", async () => {
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /host: LOCAL_MCP_HOST/);
  assert.match(source, /allowedHosts: \[LOCAL_MCP_HOST, "localhost"\]/);
  assert.doesNotMatch(source, /process\.env\.HOST/);
  assert.match(source, /process\.once\("SIGINT"/);
  assert.match(source, /process\.once\("SIGTERM"/);
  assert.match(source, /await browser\.close\(\)/);
});
