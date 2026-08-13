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

test("container pins Playwright and persists the Taobao profile directory", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /playwright:v1\.55\.0-noble/);
  assert.match(dockerfile, /AS build/);
  assert.match(dockerfile, /FROM mcr\.microsoft\.com\/playwright:v1\.55\.0-noble AS runtime/);
  assert.match(dockerfile, /RUN npm ci\n/);
  assert.match(dockerfile, /RUN npm ci --omit=dev/);
  assert.match(dockerfile, /COPY --from=build \/app\/dist \.\/dist/);
  assert.match(dockerfile, /TAOBAO_BROWSER_IDLE_MS=300000/);
  assert.match(dockerfile, /TAOBAO_PROFILE_DIR=\/data\/taobao-profile/);
});

test("dockerignore excludes build artifacts, browser profile, git, and logs", async () => {
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");
  for (const entry of ["node_modules", "dist", ".taobao-profile", ".git"]) assert.ok(dockerignore.split("\n").includes(entry), `missing ${entry}`);
  assert.match(dockerignore, /^\*\.log$/m);
});
