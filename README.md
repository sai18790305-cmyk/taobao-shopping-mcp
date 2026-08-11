# taobao-shopping-mcp

淘宝购物 MCP 的第一版施工骨架。当前只开放：登录会话检查、商品搜索、商品详情/图片/SKU 读取、选择规格、加入购物车。

明确不存在：付款、下单、结算、改地址、删除购物车商品。

## 本地运行

```bash
npm install
npx playwright install chromium
npm run build
npm run probe -- "2mm 深绿色米珠"
```

浏览器使用持久化目录 `TAOBAO_PROFILE_DIR`，默认 `.taobao-profile`；`HEADLESS=false` 可显示浏览器窗口。不要把该目录或登录凭据提交到仓库。

## 探针状态

本施工窗的 Cloud Browser 对淘宝站点被环境安全策略拦截，因此尚未得到真实淘宝页面数据。`probe` 会在目标浏览器不可达或未登录时输出结构化阻断结果，不会尝试绕过拦截。
