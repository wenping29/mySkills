# ABP / filter 语法到 DNR 映射

## 基础映射

| ABP / filter 语法 | DNR 写法 | 说明 |
|-------------------|----------|------|
| `||domain^` | `condition.requestDomains: ["domain"]` | 纯域名锚点，含子域；不要原样写 urlFilter |
| `||domain/path^` | `requestDomains` + `urlFilter` | `^` 近似为 `*` |
| `*banner*` | `condition.urlFilter` | DNR 原生支持 `*` |
| `|https://x/y|` | `condition.urlFilter` | 锚点按 DNR 语法转换 |
| `/regex/` | `condition.regexFilter` | 限量、限长；超限跳过 |
| `$script,image,xmlhttprequest` | `condition.resourceTypes` | 枚举必须合法 |
| `$subdocument` | `sub_frame` | 名称不同 |
| `$document` | `main_frame` | 例外规则常用 `allowAllRequests` |
| `$~script` | `excludedResourceTypes` | 排除资源类型 |
| `$third-party` | `domainType: "thirdParty"` | 一三方判定 |
| `$~third-party` | `domainType: "firstParty"` | |
| `$domain=a.com|b.com` | `initiatorDomains` | 发起方站点 |
| `$~domain=` | `excludedInitiatorDomains` | |
| `$important` | `priority: 50` | 高于普通 block |
| `$match-case` | `isUrlFilterCaseSensitive: true` | |
| `@@` | `action.type: "allow"` | 例外，priority 更高 |
| `@@...$document` | `allowAllRequests` | 整站放行 |
| `##.ad` | cosmetic 选择器 | 注入 `<style>` |
| `a.com##.ad` | 域名限定 cosmetic | 只在该域注入 |
| `~b.com##.ad` | 排除域 cosmetic | |
| `#@#` | cosmetic 例外 | 保守做法：跳过 |

## 建议 id 段

| 层 | id 范围 | 说明 |
|----|---------|------|
| 核心静态 | 1 - 150000 | 随包发布，构建期生成 |
| 自定义静态 | 200001+ | 用户本地规则，优先级 +100 |
| 动态白名单 | 400000+ | allow 规则 |
| 动态远程 | 410000+ | 精选更新规则 |

Chrome DNR 要求扩展内全局唯一。接真实规则源前先核对最大 id。

## 建议 priority

| 规则类型 | priority |
|----------|----------|
| 自定义例外 | 200 |
| 白名单 allow | 100 |
| 自定义 block | 101 |
| 上游 important | 50 |
| 上游 block | 1 |

原则：用户规则 > 白名单 > 上游重要 > 上游普通。

## 裁剪评分（触上限时先裁谁）

推荐从高到低保留：

1. 例外规则（1000）
2. important（500）
3. 纯通用拦截骨干（120）
4. 域名限定（20）
5. 资源类型限定（10）
6. 正则（-30）

纯通用拦截规则是覆盖率命门，不能先裁。

## 输出自检

- id 唯一
- `action.type` 合法
- `resourceTypes` 在 DNR 合法枚举内
- `urlFilter` 与 `regexFilter` 恰好其一
- 正则长度与数量未超限
- 纯 `requestDomains` 条件允许存在
- 任一失败：退出码 1，不产出非法 ruleset

## 保守跳过

以下语法宁可少拦，不要误拦：

`$redirect` `$rewrite` `$csp` `$header` `$sitekey` `$popup`、未知选项、cosmetic 例外 `#@#`、超长 urlFilter/regex。

跳过原因写入构建报告，便于追溯。
