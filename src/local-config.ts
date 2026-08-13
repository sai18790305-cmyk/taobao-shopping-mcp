import { existsSync } from "node:fs";
import path from "node:path";

export const LOCAL_MCP_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_PORT = 3000;
export const TUNNEL_API_KEY_ENV = "CONTROL_PLANE_API_KEY";
export const TUNNEL_ID_ENV = "OPENAI_MCP_TUNNEL_ID";

type Environment = Record<string, string | undefined>;

export function chromeCandidates(env: Environment = process.env): string[] {
  const candidates = [env.TAOBAO_CHROME_PATH];
  if (env.PROGRAMFILES) candidates.push(path.win32.join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"));
  if (env["PROGRAMFILES(X86)"]) candidates.push(path.win32.join(env["PROGRAMFILES(X86)"]!, "Google", "Chrome", "Application", "chrome.exe"));
  if (env.LOCALAPPDATA) candidates.push(path.win32.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate?.trim())))];
}

export function resolveChromeExecutable(
  env: Environment = process.env,
  fileExists: (candidate: string) => boolean = existsSync,
): string {
  const executable = chromeCandidates(env).find(fileExists);
  if (executable) return executable;
  throw new Error(`Google Chrome was not found. Install Chrome or set TAOBAO_CHROME_PATH. Checked: ${chromeCandidates(env).join(", ") || "no Windows Chrome paths available"}`);
}

export function resolveProfileDirectory(env: Environment = process.env): string {
  if (env.TAOBAO_PROFILE_DIR?.trim()) return env.TAOBAO_PROFILE_DIR;
  if (env.LOCALAPPDATA?.trim()) return path.win32.join(env.LOCALAPPDATA, "taobao-shopping-mcp", "taobao-profile");
  return path.resolve(".taobao-profile");
}

export function readTunnelEnvironment(env: Environment = process.env): { apiKey: string; tunnelId: string } {
  const apiKey = env[TUNNEL_API_KEY_ENV]?.trim();
  if (!apiKey) throw new Error(`${TUNNEL_API_KEY_ENV} is required`);
  const tunnelId = env[TUNNEL_ID_ENV]?.trim();
  if (!tunnelId) throw new Error(`${TUNNEL_ID_ENV} is required`);
  return { apiKey, tunnelId };
}
