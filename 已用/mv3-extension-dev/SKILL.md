---
name: mv3-extension-dev
description: Chrome/Edge Manifest V3 浏览器扩展开发与上架。当用户要做浏览器插件、广告拦截器、内容脚本、declarativeNetRequest 规则、Shadow DOM 元素隐藏、规则订阅/编译、扩展评测或商店打包时使用。含 DNR 规则映射、白名单优先级、Service Worker 生命周期、cosmetic 过滤、匿名统计与许可证红线。
---

# MV3 Extension Dev

面向 Manifest V3 的可运行扩展开发方法。核心原则：先对齐 MV3 工程现实，再写 PRD 里的理想方案；能本地验证闭环，再谈商店上架。

## 何时使用

- 新建 Chrome/Edge MV3 扩展
- 广告拦截、请求拦截、元素隐藏、规则订阅
- 现有 MV2 扩展迁移 MV3
- 扩展规则编译、覆盖率评测、打包上架
- 排查 Service Worker、DNR、Shadow DOM 相关问题

不适用：Firefox 专属 MV2 能力、App 内广告拦截、纯网页脚本。

## 交付物

1. 可加载的扩展骨架（manifest + SW + content + popup/options）
2. 规则编译链路（输入规则 → 静态 ruleset / cosmetic 注入文件）
3. 最小评测集与覆盖率基线
4. 自测清单 + 打包产物 + 商店材料

## 架构骨架

```text
extension/
├── manifest.json            # MV3 配置、权限、ruleset 注册
├── src/
│   ├── shared.js            # 存储 schema、统计、上报契约
│   ├── background.js        # Service Worker：规则更新、计数、消息
│   ├── content.js           # cosmetic 过滤、shadow DOM、MutationObserver
│   ├── cosmetic-*.js        # 由规则编译生成，勿手改
│   ├── popup.html/js/css    # 开关、站点暂停、当日统计
│   └── options.html/js      # 白名单、规则源、隐私
├── rules/                   # 静态 DNR ruleset（生成物）
├── filters/                 # 用户/示例 ABP 规则输入
├── tools/                   # build-rules.js / fetch-rules.js
├── evaluation/              # sites.json + 覆盖率脚本
└── tests/self-test.md       # TC 清单
```

## 推荐开发顺序

1. 写清产品边界：拦截范围、是否全覆盖、是否统计、是否商业化。
2. 搭 manifest + 最小 SW + 一个 content script，先跑通加载。
3. 做规则编译：ABP 语法 → DNR；先生成 10 条示例规则验证。
4. 接静态 ruleset、白名单动态规则、全局开关。
5. 做 popup/options 与本地统计。
6. 建评测集，跑静态覆盖率，修规则匹配 bug。
7. 接真实规则源（先确认许可证），压测规则上限与产物体积。
8. 补隐私政策、权限声明、图标、打包、商店提交。

## DNR 规则层

必须遵守：

1. `||host^` 不能原样写进 `urlFilter`。DNR 不识别 `||` 和 `^`，会导致规则 0 命中。纯域名锚点转成 `condition.requestDomains`；带路径时用 `requestDomains + urlFilter`。
2. 规则 id 在扩展内全局唯一。提前分段：静态核心 / 自定义 / 白名单 / 远程动态，互不重叠。
3. 白名单 `allow` 的 priority 必须高于静态 `block`；白名单条件用 `initiatorDomains`（发起方站点），不是 `requestDomains`。
4. `updateDynamicRules` 必须先 remove 再 add，否则旧 id 冲突报错。
5. `updateEnabledRulesets` 的 ruleset id 必须已在 manifest 的 `rule_resources` 声明。
6. 静态 ruleset 只能随包发布；运行时不能替换。完整规则必须在构建期预编译。
7. 动态规则有数量上限，精选规则才放动态层。
8. 正则规则限量、限长；超限整条跳过，不要截断成错误规则。
9. 输出前自检：id 唯一、action 合法、resourceTypes 合法、urlFilter 与 regexFilter 恰好其一。
10. 裁剪时优先保留通用拦截骨干（如 `||doubleclick.net^`），否则覆盖率会反降。

详细映射见 `references/dnr-mapping.md`。

## Cosmetic 过滤层

1. 优先一次性注入 `<style>`（`display:none`），不要逐节点 querySelector，几千条选择器会卡页。
2. 只注入与当前域名相关的选择器；域名/排除域在编译期处理。
3. `:has()` 是"活的 CSS"，能自动命中延迟注入的广告，优先用社区验证过的纯 CSS 规则。
4. `:has-text()` 是程序化规则，只在特定时机跑一次会漏掉延迟内容；必须配 `MutationObserver`（防抖 200-500ms）重跑。
5. Shadow DOM 必须递归遍历 `shadowRoot` 并在每个 root 注入样式；`closed` shadow DOM 无法进入，要如实说明限制。
6. 隐藏节点打标记去重，避免 MutationObserver 反复计数虚高。
7. 避免 `[class^="ad-"]` 这类宽前缀，容易误杀 `ad-note` 等正常元素；优先域名限定 + 精确 class。
8. 延迟注入场景要覆盖：`load` 之后 fetch、无限滚动、SPA 路由切换。

## Service Worker 与状态

- SW 随时会被终止，不要依赖模块级变量或 `setInterval`。
- 所有持久状态写 `chrome.storage.local`；定时任务用 `chrome.alarms`。
- 消息处理要可重入；重复触发不能重复计数。
- 统计写入用内存缓冲 + 批量落盘，避免高频 IO。

## 匿名统计与隐私

- 只上报聚合字段，不上报完整 URL、搜索词、表单内容、精确设备信息。
- 字段白名单校验：越权字段直接 400。
- `device_id` 随机、可重置，重置后不可关联历史。
- 首次运行必须告知统计内容与关闭方式；关闭后禁止任何上报。
- 服务端：Bearer token、CORS 白名单、速率限制、按日日志、留存清理、审计日志。
- 规则源下载必须校验哈希/签名，防止规则被篡改。

## 评测与基线

- 评测集要用真实子域，不要用裸域名。EasyList 常在 `ad.doubleclick.net` 这类子域拦截，裸域名会失真。
- 网络层覆盖率与综合覆盖率分开算：网络层只测 DNR，综合 = 网络 ∪ 站点专属 cosmetic。
- 先跑示例规则，确认匹配器没有 bug，再接真实规则源。
- 记录基线日期、规则条数、覆盖率、漏拦清单，后续改动必须能复现。
- 真机覆盖率用浏览器自动化复用同一份 `sites.json`，静态覆盖率只是下界。

## 打包与上架

- 只打运行时文件：manifest、rules、src；tools/filters/tests 不进包。
- 先跑规则编译，确认 build report 跳过分布符合预期。
- 补齐图标、版本号、商店描述、隐私政策公开 URL。
- 权限逐条写理由，与 manifest 实际权限一致；广告拦截类通常需要 `<all_urls>`，要在权限声明中解释。
- 规则源许可证是红线：EasyList 系默认禁止商业用途；商业化前必须换宽松许可证源或自建规则，并保留 NOTICE 署名。
- 打包后解压抽查：manifest、ruleset、content 注入顺序、版本号。

## 常见故障排查

| 现象 | 优先检查 |
|------|----------|
| 扩展加载失败 | manifest JSON、ruleset 路径、图标路径 |
| 规则 0 命中 | `||host^` 是否被原样写进 urlFilter |
| 白名单无效 | allow priority 是否高于 block；是否用错域名条件 |
| 动态规则报 id 冲突 | 是否先 remove 再 add；id 段是否重叠 |
| 统计虚高 | 是否重复计数；节点是否打标记去重 |
| 延迟内容漏拦 | 是否只有 load 时执行；是否缺 MutationObserver |
| Shadow DOM 漏拦 | 是否递归遍历 shadowRoot；是否 closed |
| 商店审核驳回 | 权限理由、隐私政策、单一用途说明 |

更多坑见 `references/mv3-pitfalls.md`。

## 参考

- `references/dnr-mapping.md`：ABP → DNR 映射、id 段、优先级
- `references/mv3-pitfalls.md`：工程坑与修复方式
