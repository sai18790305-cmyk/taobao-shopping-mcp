# taobao-shopping-mcp

淘宝购物 MCP 的 Windows 本地按需版。只开放登录会话检查、商品搜索、商品详情/图片/SKU 读取、选择规格，以及一次性确认后的加入购物车。

明确禁止付款、下单、结算、改地址和删除购物车商品。服务只监听 `127.0.0.1`，不需要也不应部署到 Zeabur。

## Windows 准备

需要 Node.js 20+、已安装的 Google Chrome，以及 OpenAI 官方 `tunnel-client`。从 [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) 创建 Tunnel 并下载客户端；Secure MCP Tunnel 的官方说明见 [OpenAI Docs](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。

在启动它的 PowerShell 会话中设置两个环境变量：

```powershell
$env:CONTROL_PLANE_API_KEY = "你的 runtime API key"
$env:OPENAI_MCP_TUNNEL_ID = "tunnel_..."
```

密钥和 Tunnel ID 只从环境变量读取，不要写进 `.env`、脚本、仓库或日志。若 `tunnel-client.exe` 不在 `PATH`，可设置 `TAOBAO_TUNNEL_CLIENT_PATH`；Chrome 不在标准位置时可设置 `TAOBAO_CHROME_PATH`。

## 一键启动与停止

```powershell
.\scripts\start-local.ps1
.\scripts\stop-local.ps1
```

启动脚本会执行 `npm ci` 和构建，检测 Chrome，启动本地 MCP，再初始化并运行 Secure MCP Tunnel。MCP 地址固定为 `http://127.0.0.1:3000/mcp`；可用 `-Port` 改端口。

浏览器在第一次调用淘宝工具时才启动，默认显示窗口并只保留一个页面。专用登录目录默认为 `%LOCALAPPDATA%\taobao-shopping-mcp\taobao-profile`，登录一次后可持续复用；不要改成日常 Chrome 的用户目录。`TAOBAO_BROWSER_IDLE_MS` 默认 `300000`，闲置五分钟自动关闭浏览器，设为 `0` 可禁用。

停止脚本会终止 Tunnel、本地 MCP 和其管理的 Chrome 进程树，并删除不含密钥的 PID 状态文件。

## 连接 ChatGPT

保持启动脚本创建的后台进程运行。在 ChatGPT 开发者模式中新建应用，Connection 选择 **Tunnel**，再选择或填写同一个 `tunnel_id`。Secure MCP Tunnel 只建立从本机到 OpenAI 的出站 HTTPS 连接，不会把本地 MCP 暴露到公网。

## 本地接口

- `GET http://127.0.0.1:3000/health`
- `POST/GET/DELETE http://127.0.0.1:3000/mcp`

加购仍必须先调用 `taobao_confirm_add_to_cart` 获取匹配 SKU 的一次性令牌；令牌使用后失效，并且执行后必须检测页面成功信号。导航仍仅允许淘宝系域名。
