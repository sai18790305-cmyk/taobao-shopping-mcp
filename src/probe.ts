import { TaobaoBrowser } from "./taobao-browser.js";

const browser = new TaobaoBrowser();
const query = process.argv.slice(2).join(" ") || "2mm 深绿色米珠";
try {
  const session = await browser.sessionStatus();
  const report: Record<string, unknown> = { mode: "probe-only", environment: { headless: process.env.HEADLESS !== "false", profile: process.env.TAOBAO_PROFILE_DIR ?? ".taobao-profile" }, session, safety: "Probe-only verifies Taobao reachability and login state; product search, confirmation, and add-to-cart are disabled." };
  report.result = session.blocked ? "taobao_unreachable" : session.loggedIn ? "reachable_and_logged_in" : "reachable_but_not_logged_in";
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
