# taobao-shopping-mcp

淘宝购物 MCP。当前只开放：登录会话检查、商品搜索、商品详情/图片/SKU 读取、选择规格、一次性确认后加入购物车。

明确不存在：付款、下单、结算、改地址、删除购物车商品。

## 本地运行

```bash
npm install
npx playwright install chromium
npm run build
npm run probe -- "2mm 深绿色米珠"
```

浏览器按工具调用懒启动，并只保留一个页面。使用持久化目录 `TAOBAO_PROFILE_DIR`，默认 `.taobao-profile`；`HEADLESS=false` 可显示浏览器窗口。`TAOBAO_BROWSER_IDLE_MS` 控制闲置自动关闭，默认 `300000`（5 分钟），设为 `0` 可禁用。不要把该目录或登录凭据提交到仓库。

## 服务入口

服务同时保留 stdio，并在 `PORT`（默认 `3000`）提供 Streamable HTTP：

- `GET /health`：健康检查
- `POST/GET/DELETE /mcp`：MCP Streamable HTTP

加购必须先调用 `taobao_confirm_add_to_cart` 获取一次性令牌，再把令牌传给 `taobao_add_to_cart`；执行后只在页面出现成功信号时报告已验证加购。导航只允许淘宝系域名（`taobao.com`、`tmall.com` 及其子域名）。

## 探针状态

本施工窗的 Cloud Browser 对淘宝站点被环境安全策略拦截，本地 Chromium 运行时也未安装，因此尚未得到真实淘宝页面数据。`probe` 会在目标浏览器不可达或未登录时输出结构化阻断结果，不会尝试绕过拦截。
