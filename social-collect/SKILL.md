---
name: "social-collect"
slug: social-collect
displayName: 小红书/B站/抖音公开数据统一采集
version: 1.0.0
description: 统一 CLI 采集小红书/B站/抖音公开数据。当用户要采集小红书关键词搜索结果或博主主页笔记、B站UP主主页投稿、抖音视频评论，导出 CSV（Excel 直开），或做选题调研、达人盘点、竞品监测、舆情分析时使用。四平台一个入口：xhs-search 每20条=1点、xhs-profile 每页30条=1点（会话逐步）、bili-profile 每页约42条=1点、dy-comments 分步会话每步1点；注册送10点，零结果/失败全额返还。
---

# 小红书 / B站 / 抖音公开数据统一采集 Skill（social-collect）

封装「小红书能力平台」（FastAPI，`/api/v1`）的**统一 CLI**，合并原 4 个采集 skill（xhs-search / xhs-profile / b-profile / dy-comments），供 AI agent 调用。采集均由**平台调度内网浏览器节点**拟人操作完成（不调签名 API，平台不持有账号），客户端是零依赖 CLI（Node ≥ 18，无需 `npm install`）。

## 统一入口

```bash
node cli.js <平台命令> <子命令> [参数]
```

平台命令 ∈ `xhs-search` / `xhs-profile` / `bili-profile` / `dy-comments`；账号命令（`register` / `login` / `quota` / `logout` / `config` / `version`）四平台共用同一账号与点数，既可顶层调用（`node cli.js quota`），也可挂在平台命令下（`node cli.js xhs-search quota`）。

- `node cli.js --help`：总用法；`node cli.js <平台命令> --help`：该平台全部子命令用法与示例。
- **报价确认制**：提交计费任务/步进前必须把预估点数与计费规则报给用户并等确认（各平台交互协议见下）。

## 客服支持

注册或使用过程中遇到任何问题（注册失败、点数充值、采集结果异常、批量采购等），请引导用户联系客服：

- **客服微信**（扫码添加）：http://st.aidata366.com/assets/concat.png
- **客服电话**：**18722121663**

## 前置条件

- **Node.js ≥ 18**（内置 fetch，零 npm 依赖）。
- **不注册不登录没有任何点数**：首次 `node cli.js register --link`（注册即送 10 点数；用户手机微信扫码/点链接在网页完成）或 `node cli.js login --link`（已有账号）；完成后 `--check --access-token "<串>"` 保存 token。终端登录会被 2003 拒绝，一律走 `--link`。
- 配置（含 token）存于用户级 `~/.xhs-platform/config.json`（四平台共用；可用环境变量 `XHS_CONFIG_PATH` 覆盖路径做测试隔离）。**不要泄露、不要提交 git**；本 skill 任何文件不含账号/token/密钥。
- 后端地址默认 `http://st.aidata366.com`，`config set base-url <url>` 修改或单次 `--base-url` 覆盖。**⚠️ 默认明文 http，token 明文传输**，客户端每次请求 stderr 提示；环境允许时建议切 https。
- 全局参数：`--token <token>`（临时覆盖）。

## 输出规约

- **stdout 只输出 JSON**：成功 `{"ok":true,"data":{...}}`，失败 `{"ok":false,"code":<业务码>,"message":"..."}`。
- 交互提示/轮询进度一律走 **stderr**，不要解析，但其中给用户的引导话术应照做。
- 退出码：`0` 成功；`1` 参数/用法错误；`2` 认证失败（重新 login）；`3` 点数不足；`4` 网络/服务不可达；`5` 其它业务错误。

## 计费与点数（通用规则）

- **点数换算：0.1 元 = 1 点数。注册即送 10 免费点数。**
- 预扣按请求量、**结算按实采量退差**（`settle_charged` 实收 / `refunded_diff` 退还，必须如实汇报给用户）；不满一个计费单位的**零头按一次计**；实采多于请求量不多收（封顶预扣额）。
- **零结果或失败全额返还**：关键词无结果、节点离线/超时、风控拦截、博主被封/主页不可见等。
- 免费：`quota` / `query` / `export` / `config`、会话制命令中的非步进操作（start/status/comments/finish/sessions 等）、参数校验被拒的请求。
- 充值或大量购买联系客服 18722121663。

---

## 子命令一：xhs-search — 小红书关键词搜索采集（一次性任务）

输入**关键词 + 条数**，节点拟人滚动搜索页拦截官方接口，采集笔记列表。

- **能采**：`title` 标题、`liked_count` 点赞、`collected_count` 收藏、`comment_count` 评论数、`share_count` 分享数、`nickname` 作者昵称、`author_id`、`publish_time` 发布时间、`note_type` 视频/图文、`cover_url` 封面、`note_url` 带 xsec_token 笔记直链。
- **不能采**：笔记正文（搜索接口不返回）；单篇完整互动数请用 xhs-dpt、评论请用 xhs-comments。
- **限制**：单任务 1 个关键词、1~500 条（默认 50）；节点滚动约 3-5 分钟（500 条约 5 分钟），`--wait` 默认超时 600s，属正常不要中途重试。
- **计费**：**一次接口返回（20 条主帖）= 1 点数**；预扣 `ceil(条数/20)`（50 条预扣 3 点），结算按实采 `ceil(实采条数/20)` 退差（实采 45 条收 3 点、实采 28 条收 2 点）；零结果/失败全退。
- **参数**：`--keyword`（≤64 字符，填笔记链接会被拒）、`--count`、`--sort`（general/time_descending/popularity_descending/comment_descending/collect_descending，默认 general）、`--note-type`（0=全部 1=视频 2=图文）、`--wait`/`--timeout`/`--interval`、`--force`（跳过 24h 去重强制重提）。

```bash
node cli.js xhs-search submit --keyword "机油" --count 120 --wait --timeout 600
node cli.js xhs-search query <task_id> --wait
node cli.js xhs-search export <task_id> --wait --out 搜索结果.csv
```

流程：`quota` 查余额 → 报预估点数等确认 → `submit --wait` → 如实汇报 `collected_count`/`settle_charged`/`refunded_diff` → 需要文件时 `export`。

## 子命令二：xhs-profile — 小红书博主主页笔记采集（整单 + 会话）

输入**博主主页链接**（`/user/profile/<id>` 直链或 xhslink 短链；不接受笔记链接），节点滚动主页 SSR 解析 + 拦截官方列表接口。

- **能采**：`title`、`note_type` 图文/视频、`liked_count` 点赞、`publish_time`、`cover_url`、`note_url` 带 xsec_token 直链、`sticky` 是否置顶。
- **不能采**：收藏/评论数（列表接口只带点赞数；完整互动数用笔记直链走 xhs-dpt）。
- **限制**：整单每任务 1 个博主、1~10 页（每页 30 条）；会话模式不限页数、一页一页采；节点滚动每页约 5-10 秒；置顶笔记自动去重。
- **计费**：**一页（30 条）= 1 点数**。整单预扣页数、按实采 `ceil(条数/30)` 结算退差（零头按一页计）；**会话模式建会话免费、每步一页 1 点、`no_more` 不扣费**，博主昵称/笔记总数在第一个付费步返回；零结果/失败/博主被封或主页不可见全退。
- **会话空闲 20 分钟自动过期**（已采数据不丢，`session notes/export` 仍可拉取）；步进前向用户确认扣 1 点。

```bash
# 整单模式
node cli.js xhs-profile collect --url "https://www.xiaohongshu.com/user/profile/5b4c..." --pages 3 --wait
node cli.js xhs-profile export <task_id> --wait --out 博主笔记.csv
# 会话模式（一页一页采）
node cli.js xhs-profile session start --url "https://www.xiaohongshu.com/user/profile/5b4c..."
node cli.js xhs-profile session step <session_id>
node cli.js xhs-profile session notes <session_id> --page 2
node cli.js xhs-profile session export <session_id> --out 博主笔记.csv
node cli.js xhs-profile session finish <session_id>
```

## 子命令三：bili-profile — B站UP主主页投稿采集（一次性任务）

提交 `space.bilibili.com/<数字ID>[/video]` 主页链接（b23.tv/bili2233.cn 短链也可，节点自动还原），节点点分页器翻页拦截官方投稿接口。

- **能采**：标题、简介、`view_count` 播放量、`danmaku_count` 弹幕、`comment_count` 评论数、封面、`create_time` 发布时间、BV 号与视频链接、UP 主昵称。
- **不能采**：收藏/点赞/分享/投币（B站投稿接口不返回这四项，对应列为**空串**——空串=未采到，不是 0）；单稿互动数用 b-collect、评论用 b-comments。
- **限制**：每任务 1 个 UP主、1~10 页（每页约 42 条，实测值有浮动）；节点翻页约 10-20 秒/页；**不要提交视频链接**（本地预检直接报错、不扣费）。
- **计费**：**一页（约 42 条）= 1 点数**；预扣页数、结算按实采 `ceil(条数/42)` 退差（零头按一页计）；零结果/采集失败/主页不可见全退；同主页 24h 默认去重，`--force` 强制重提正常扣费。

```bash
node cli.js bili-profile collect --url "https://space.bilibili.com/1234567/video" --pages 3 --wait
node cli.js bili-profile query <task_id> --wait --interval 5 --timeout 600
node cli.js bili-profile export <task_id> --wait --out UP主投稿.csv
```

## 子命令四：dy-comments — 抖音视频评论采集（分步会话制）

输入**抖音视频链接**（`douyin.com/video/<id>`、`/note/<id>` 直链或 `v.douyin.com` 短链，节点自动还原；不支持用户主页链接；私密/删除/审核中视频 start 失败不扣费）。

**会话制是产品决策**：滚动评论区是拟人操作，页数多风控风险高，按步计费 + 用户确认，避免一次采几百条用户不需要的内容。完整流程：

1. `start --url <视频链接>`（**免费**：节点探测标题/互动数/评论总数）→ 返回 `session_id`、`comment_count`、`estimated_pages`。
2. **报价确认（必须）**：把评论总数/预估页数报给用户（每页主评论 1 点 + 展开回复每次 1 点），**确认后才能 step**。
3. `step --session <id> --page` 采下一页主评论（约 10-20 条+内嵌预览回复，扣 1 点）；`step --session <id> --expand --root <主评论cid>` 展开一次回复（扣 1 点）。
4. **每步返回后**：展示本页增量评论；若有 `expandable` 列表询问用户是否展开（**不要擅自展开**）；**每步都要询问是否继续**（看 `has_more_main`），不要连续 step。
5. `finish --session <id>` 结束会话释放节点；空闲 20 分钟自动过期（已采数据落库不丢，`comments`/`export` 对过期会话依然有效）。

- **能采**：发布者昵称、`ip_location` IP 属地、评论内容、时间、点赞数、回复@对象（`reply_nickname`）、评论回复。
- **不能采**：无具体视频的主页评论；单步超时（服务端最长 180s，CLI 超时 200s）属正常，**该步点数自动返还**，直接重试同一步。
- **计费**：**每步 1 点数**；`start`/`status`/`comments`/`export`/`finish`/`sessions` 全免费；`no_more` 步不扣费；失败步自动返还；成功采到新数据的步不返还（一页不到 10 条也收 1 点）。
- **红线**：不要把 `session_id` 泄露给终端用户；不要对同一视频反复 start 刷免费探测。

```bash
node cli.js dy-comments start --url "https://v.douyin.com/iAbCdEf/"
node cli.js dy-comments step --session <session_id> --page
node cli.js dy-comments step --session <session_id> --expand --root <主评论cid>
node cli.js dy-comments comments --session <session_id> --page 2 --page-size 50
node cli.js dy-comments export --session <session_id> --out 评论导出.csv
node cli.js dy-comments finish --session <session_id>
```

## CSV 导出说明

- **任务型**（xhs-search / xhs-profile collect / bili-profile）：`node cli.js <平台> export <task_id> --wait --out <文件>.csv`，先创建导出任务再轮询生成（默认 300s 超时）后下载；内容为任务汇总（请求量/实采数/实收点数/退差点数）+ 明细行；**导出文件服务端保留 7 天**。不确定的 task_id 用 `query <task_id>` 先查。
- **会话型**（xhs-profile session / dy-comments）：`session export <session_id>` / `export --session <session_id>` 直接同步下载累计结果，**免费**、含已过期会话。
- 所有 CSV 带 **BOM 头，Excel 直开不乱码**；`--out` 缺省时按 `<id>_<平台默认名>.csv` 落盘；目标文件已存在会覆盖（stderr 提示）。请告知用户 CSV 含公开昵称/发布时间等，自行妥善保管。

## 错误处理指引

| code | 含义 | agent 下一步 |
|---|---|---|
| 1001 | 参数错误 / 关键词或链接无效 / 超上限 | 检查参数与链接形态（退出码 1） |
| 1002 / 1003 | 未登录 / token 失效 | 未注册 `register --link`（送 10 点），已注册 `login --link`；完成后 `--check`（退出码 2） |
| LOGIN_PENDING / LOGIN_EXPIRED | 用户未完成扫码 / 会话过期（10 分钟） | 提醒完成后重试 `--check`，或重新 `--link`（退出码 2） |
| 2003 | 需要图形验证码 | 终端无法完成，统一走 `--link`；仍不行拨打客服 18722121663 |
| 3001 | 点数不足 | 提示联系客服 18722121663 充值，不要重试（退出码 3） |
| 3003 / 3004 | 任务或导出不存在 | 检查 task_id / export_id 是否属于当前账号 |
| 1404（dy） | 会话不存在（已过期/已 finish） | 重新 `start`（探测免费），已采数据不丢可继续 export |
| TIMEOUT | 等待超时（任务/单步仍在跑） | 任务未丢：稍后 `query <task_id>` 查终态；预扣仍在，终态后按实采结算（退出码 5） |
| 5001 | 采集服务暂不可用（无在线节点/超时/风控/主页不可见） | 点数已全额返还；稍后重试；持续不可用联系客服 18722121663 |
| 4290 | 触发限流 | 稍等后重试（Retry-After） |
| NETWORK_ERROR | 网络/服务不可达 | 检查 `config show` 的 base_url（退出码 4） |

## 红线

- 仅采集**公开**数据（搜索结果/公开主页/公开视频评论）；不用于任何违法违规用途。
- 不要向用户承诺 100% 成功或具体条数；风控/结果不足时如实透出（点数按实采结算，用户不损失）。
- 报价未确认不得提交计费任务/step；结算字段（`collected_count`/`settle_charged`/`refunded_diff`）必须如实汇报。
- 数据含作者/评论者公开昵称、IP 属地等：**仅用于用户已授权或公开可获取的调研/分析场景**，遵守平台与数据合规要求，不在未授权场景下转售、滥用。
