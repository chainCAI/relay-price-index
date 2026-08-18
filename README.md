# 中转站模型比价

AI 中转站模型广场价格对比：gemini-3.7-flash、deepseek-v4-flash、grok-4.6、gpt-luna/sol/terra，
统一折算为倍率后实际计费价（$/1M tokens），按低价排序。

纯静态站点（无依赖、离线可开）：

- `index.html` — 页面
- `styles.css` — 样式（Arco 极简风）
- `app.js` — 筛选/排序/弹窗逻辑
- `data.js` — 数据快照（由抓取脚本生成）

## 数据更新

数据由 `doubao-nomark` 仓库的抓取脚本产生：

```bash
python scrape_relay_prices.py   # 抓取 20 个中转站模型广场定价
python make_site.py             # 生成 price-site/data.js
```

把生成的 `data.js` 覆盖到本目录后重新部署即可。
