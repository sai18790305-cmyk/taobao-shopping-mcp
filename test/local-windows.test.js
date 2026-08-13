import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chromeCandidates,
  LOCAL_MCP_HOST,
  readTunnelEnvironment,
  resolveChromeExecutable,
  resolveProfileDirectory,
} from "../dist/local-config.js";

test("local configuration binds MCP to loopback and uses a persistent Windows profile", () => {
  assert.equal(LOCAL_MCP_HOST, "127.0.0.1");
  assert.equal(
    resolveProfileDirectory({ LOCALAPPDATA: "C:\\Users\\su\\AppData\\Local" }),
    "C:\\Users\\su\\AppData\\Local\\taobao-shopping-mcp\\taobao-profile",
  );
  assert.equal(resolveProfileDirectory({ TAOBAO_PROFILE_DIR: "D:\\TaobaoProfile" }), "D:\\TaobaoProfile");
});

test("Chrome detection prefers an explicit path and checks standard Windows installs", () => {
  const env = {
    TAOBAO_CHROME_PATH: "D:\\Chrome\\chrome.exe",
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\su\\AppData\\Local",
  };
  assert.deepEqual(chromeCandidates(env), [
    "D:\\Chrome\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\su\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
  ]);
  assert.equal(resolveChromeExecutable(env, (candidate) => candidate === env.TAOBAO_CHROME_PATH), env.TAOBAO_CHROME_PATH);
  assert.throws(() => resolveChromeExecutable(env, () => false), /Google Chrome was not found/);
});

test("tunnel configuration rejects each missing environment variable", () => {
  assert.throws(() => readTunnelEnvironment({}), /CONTROL_PLANE_API_KEY is required/);
  assert.throws(() => readTunnelEnvironment({ CONTROL_PLANE_API_KEY: "secret" }), /OPENAI_MCP_TUNNEL_ID is required/);
  assert.deepEqual(readTunnelEnvironment({ CONTROL_PLANE_API_KEY: "secret", OPENAI_MCP_TUNNEL_ID: "tunnel_test" }), {
    apiKey: "secret",
    tunnelId: "tunnel_test",
  });
});

test("PowerShell scripts start local MCP and tunnel without persisting secrets", async () => {
  const start = await readFile(new URL("../scripts/start-local.ps1", import.meta.url), "utf8");
  assert.match(start, /Get-RequiredEnvironment "CONTROL_PLANE_API_KEY"/);
  assert.match(start, /Get-RequiredEnvironment "OPENAI_MCP_TUNNEL_ID"/);
  assert.match(start, /npmCommand\.Source ci/);
  assert.match(start, /http:\/\/127\.0\.0\.1:\$Port\/mcp/);
  assert.match(start, /"init", "--sample", "sample_mcp_stdio_local"/);
  assert.match(start, /"--mcp-server-url", \$mcpUrl/);
  assert.match(start, /Start-Process[^\n]+dist\/server\.js/);
  assert.doesNotMatch(start, /Set-Content[^\n]+(?:apiKey|tunnelId)/i);
  assert.doesNotMatch(start, /Write-(?:Host|Output)[^\n]+(?:apiKey|tunnelId)/i);
});

test("stop script terminates complete process trees and removes runtime state", async () => {
  const stop = await readFile(new URL("../scripts/stop-local.ps1", import.meta.url), "utf8");
  assert.match(stop, /taskkill\.exe \/PID \$ProcessId \/T \/F/);
  assert.match(stop, /Stop-ProcessTree \(\[int\]\$state\.tunnelPid\)/);
  assert.match(stop, /Stop-ProcessTree \(\[int\]\$state\.serverPid\)/);
  assert.match(stop, /Remove-Item -LiteralPath \$statePath -Force/);
});
