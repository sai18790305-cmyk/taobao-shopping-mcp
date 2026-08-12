import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("server annotates tools and hides cart writes in probe-only mode", async () => {
  const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /readOnlyHint: true/);
  assert.match(source, /externalWriteAnnotations/);
  assert.match(source, /if \(!probeOnly\)/);
  assert.match(source, /process\.env\.PROBE_ONLY === "true"/);
});

test("container pins Playwright and persists the Taobao profile directory", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /playwright:v1\.55\.0-noble/);
  assert.match(dockerfile, /TAOBAO_PROFILE_DIR=\/data\/taobao-profile/);
});
