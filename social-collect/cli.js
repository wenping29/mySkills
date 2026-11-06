#!/usr/bin/env node
'use strict';
/**
 * cli.js — social-collect 统一采集 CLI (合并自 4 个 skill, 自包含零依赖)。
 *
 * 用法: node cli.js <平台命令> <子命令> [参数]
 *   平台命令 ∈ xhs-search | xhs-profile | bili-profile | dy-comments
 *   账号命令 (register/login/quota/logout/config/version) 四平台共用,
 *   既可顶层调用 (node cli.js quota), 也可挂在任一平台命令下 (node cli.js xhs-search quota)。
 *
 * 能力映射 (与原 skill 一致):
 *   xhs-search    xhs_search   一次性任务: submit --keyword/--count/--sort/--note-type
 *   xhs-profile   xhs_profile  整单 collect --url/--pages + 会话 session start|step|...
 *   bili-profile  b_profile    整单 collect --url/--pages (B站主页链接校验)
 *   dy-comments   dy_comments  分步会话: start/step --page|--expand/status/comments/export/finish/sessions
 *
 * 计费: 0.1 元 = 1 点数; xhs-search 每 20 条=1 点; xhs-profile 每页 30 条=1 点
 *   (会话建会话免费/每步 1 点/no_more 不扣费); bili-profile 每页约 42 条=1 点;
 *   dy-comments 每步 1 点; 零结果/失败全额返还; 注册送 10 点。
 *
 * 输出规约 (对齐原 skill): stdout 只输出 JSON, 提示走 stderr。
 * 退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ApiClient, BizError, allowInsecureTls } = require('./src/client');
const { loadConfig, saveConfig, resolveConfig, maskToken, configPaths, DEFAULT_BASE_URL, PLATFORMS } = require('./src/config');
const {
  UsageError, printOk, printFail, exitWithError, pollTask, parsePositiveNumber,
} = require('./src/output');

const VERSION = '1.0.0';
const DOWNLOAD_TIMEOUT_MS = 60000;

// 账号命令共用 flag 定义
const ACCOUNT_FLAGS = {
  value: ['token', 'base-url', 'access-token'],
  bool: ['help', 'link', 'check', 'version'],
  lenient: false,
};
const ACCOUNT_CMDS = new Set(['register', 'login', 'quota', 'logout', 'config', 'version']);

// ---------------------------------------------------------------- 参数解析

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 按平台 flag spec 解析参数。
 * spec.lenient=true (dy-comments): value-flag 缺值或后随其它 --flag 时视为布尔开关
 *   (如 step --page), 与原 dy cli 行为一致; 其余平台缺值直接报 UsageError。
 */
function parseArgs(argv, spec) {
  const value = new Set(spec.value);
  const bool = new Set(spec.bool);
  const lenient = !!spec.lenient;
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    if (!arg.startsWith('--')) throw new UsageError(`未知参数: ${arg}`);
    let inline;
    const eq = arg.indexOf('=');
    if (eq > 2) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const name = arg.slice(2);
    if (value.has(name)) {
      const next = inline !== undefined ? inline : argv[i + 1];
      if (lenient && (next === undefined || next.startsWith('--'))) {
        opts[camel(name)] = true;
      } else {
        if (next === undefined) throw new UsageError(`缺少参数值: ${arg}`);
        if (inline === undefined) i++;
        opts[camel(name)] = next;
      }
    } else if (bool.has(name)) {
      if (inline !== undefined) throw new UsageError(`参数 ${arg} 不接受值`);
      opts[camel(name)] = true;
    } else {
      throw new UsageError(`未知参数: ${arg}`);
    }
  }
  const cmd = positional.shift() || '';
  return { cmd, args: positional, opts };
}

// ---------------------------------------------------------------- 用法文本

const TOP_USAGE = `social-collect — 小红书 / B站 / 抖音公开数据统一采集 CLI（小红书能力平台 FastAPI /api/v1）

用法: node cli.js <平台命令> <子命令> [参数]
      node cli.js <账号命令> [参数]        （账号命令也可挂在任一平台命令下）

平台命令（node cli.js <平台命令> --help 查看各自用法与示例）:
  xhs-search     小红书关键词搜索采集     submit / query / export
  xhs-profile    小红书博主主页笔记采集   collect / query / export / session start|step|status|list|notes|export|finish
  bili-profile   B站UP主主页投稿采集      collect / query / export
  dy-comments    抖音视频评论采集·会话制  start / step / status / comments / export / finish / sessions

账号命令（四平台共用同一账号与点数, 配置在 ~/.xhs-platform/config.json）:
  register --link                        生成注册二维码/链接（注册即送 10 点数）
  register --check --access-token <串>   用户完成注册后确认并保存 token
  login --link / login --check --access-token <串>
  quota                                  查询点数与个人信息
  logout                                 登出当前账号
  config set base-url <url>              设置后端服务地址
  config set insecure true|false         忽略 HTTPS 证书校验（自签证书时开）
  config show                            查看当前配置（token 脱敏）
  version                                显示版本

输出规约: stdout 只输出 JSON（{ok:true,data} / {ok:false,code,message}）, 提示走 stderr。
退出码: 0 成功 / 1 参数错误 / 2 认证失败 / 3 点数不足 / 4 网络错误 / 5 其它。
计费: 0.1 元 = 1 点数; 注册送 10 免费点数; xhs-search 每 20 条=1 点; xhs-profile 每页（30 条）=1 点;
bili-profile 每页（约 42 条）=1 点; dy-comments 每步 1 点; 预扣按请求量、结算按实采量退差;
零结果或失败全额返还。

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`;

const PLATFORM_USAGE = {
  'xhs-search': `小红书搜索笔记采集 CLI（关键词搜索, 采集笔记列表）

用法: node cli.js xhs-search <子命令> [参数]

子命令:
  submit --keyword <关键词> [--count N] [--sort S] [--note-type T] [--wait] [--timeout 秒] [--interval 秒] [--force]
                                    提交搜索采集任务（每任务 1 个关键词, 1~500 条, 默认 50;
                                    --sort: general/time_descending/popularity_descending/
                                    comment_descending/collect_descending (默认 general);
                                    --note-type: 0=全部 1=视频 2=图文 (默认 0);
                                    --force 跳过 24h 内容去重强制重提;
                                    --wait 等待结果, 默认超时 600s（节点滚动约 3-5 分钟））
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>] [--timeout 秒]
                                    导出任务结果 CSV（保留 7 天; --wait 等待生成, 默认超时 300s）
  quota / logout / register --link / login --link / config ...
                                    账号命令同顶层（node cli.js --help）

能采字段: 标题/点赞/收藏/评论数/分享数/作者昵称/author_id/发布时间/笔记类型/封面图/
带 xsec_token 的笔记直链。不含笔记正文（搜索接口不返回）。

计费: 一次接口返回（20 条主帖）= 1 点数; 预扣 ceil(条数/20), 结算按实采量退差,
零头按一次计; 零结果或失败全额返还。

示例:
  node cli.js xhs-search submit --keyword "机油" --count 120 --wait --timeout 600
  node cli.js xhs-search submit --keyword "美孚" --count 40 --sort time_descending --note-type 1
  node cli.js xhs-search query <task_id> --wait
  node cli.js xhs-search export <task_id> --wait --out 搜索结果.csv

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`,

  'xhs-profile': `小红书博主主页笔记采集 CLI（博主主页链接, 采集其全部笔记列表）

用法: node cli.js xhs-profile <子命令> [参数]

整单模式（一次采 N 页, 预扣 N×1 点, 按实采退差）:
  collect --url <主页链接> [--pages N] [--wait] [--timeout 秒] [--interval 秒] [--force]
                                    提交主页采集任务（每任务 1 个博主, 1~10 页, 每页 30 条, 默认 1 页;
                                    链接为 /user/profile/<id> 直链或 xhslink 短链, 笔记链接会被拒绝;
                                    --force 跳过 24h 内容去重强制重提;
                                    --wait 等待结果, 默认超时 600s, 节点滚动每页约 5-10 秒）
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>]
                                    导出任务结果 CSV（保留 7 天）

会话模式（一页一页采, 建会话免费, 每步一页 = 1 点, 无更多不扣费; 空闲 20 分钟自动过期）:
  session start --url <主页链接>    建会话（免费）, 返回 session_id
  session step <session_id>         步进采集下一页（30 条 = 1 点; no_more 不扣费）
  session status <session_id>       会话状态/累计统计/余额
  session list [--status S] [--page N] [--page-size N]
                                    会话列表
  session notes <session_id> [--page N] [--page-size N]
                                    已采笔记分页拉取（免费）
  session export <session_id> [--out <文件路径>]
                                    会话累计结果 CSV 下载（免费）
  session finish <session_id>       主动结束会话（释放节点）
  quota / logout / register --link / login --link / config ...
                                    账号命令同顶层（node cli.js --help）

能采字段: 标题/图文或视频类型/点赞数/发布时间/封面图/带 xsec_token 笔记直链/是否置顶。
列表接口不含收藏/评论数（完整互动数请用笔记直链走 xhs-dpt）。

计费: 一页（30 条）= 1 点数; 整单预扣页数、结算按实采 ceil(条数/30) 退差（零头按一页计）;
会话建会话免费、每步一页 1 点、无更多 (no_more) 不扣费;
零结果/采集失败/博主被封或主页不可见 → 全额返还。

示例:
  node cli.js xhs-profile collect --url "https://www.xiaohongshu.com/user/profile/5b4c..." --pages 3 --wait
  node cli.js xhs-profile session start --url "https://www.xiaohongshu.com/user/profile/5b4c..."
  node cli.js xhs-profile session step <session_id>
  node cli.js xhs-profile export <task_id> --wait --out 博主笔记.csv

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`,

  'bili-profile': `B站 UP主主页投稿采集 CLI（主页链接, 采集其投稿视频列表）

用法: node cli.js bili-profile <子命令> [参数]

子命令:
  collect --url <主页链接> [--pages N] [--wait] [--timeout 秒] [--interval 秒] [--force]
                                    提交主页采集任务（每任务 1 个 UP主, 1~10 页, 每页约 42 条, 默认 1 页;
                                    主页链接支持 space.bilibili.com/<数字ID>[/video] 与 b23.tv 短链;
                                    视频链接（bilibili.com/video/<BV号>）会被拒绝;
                                    --force 跳过 24h 内容去重强制重提;
                                    --wait 等待结果, 默认超时 600s, 节点翻页每页约 10-20 秒）
  query <task_id> [--wait]          查询任务状态与结果
  export <task_id> [--wait] [--out <文件路径>]
                                    导出任务结果 CSV（保留 7 天）
  quota / logout / register --link / login --link / config ...
                                    账号命令同顶层（node cli.js --help）

能采字段: 标题/简介/播放量/弹幕/评论数/封面/发布时间/BV号/视频链接/UP主昵称。
不返回收藏/点赞/分享/投币（B站投稿接口不返回这四项, 对应列为空串）。

计费: 一页（约 42 条）= 1 点数; 预扣页数、结算按实采量退差（零头按一页计）;
零结果/采集失败/主页不可见 → 全额返还。

示例:
  node cli.js bili-profile collect --url "https://space.bilibili.com/1234567/video" --pages 3 --wait
  node cli.js bili-profile query <task_id> --wait --interval 5 --timeout 600
  node cli.js bili-profile export <task_id> --wait --out UP主投稿.csv

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`,

  'dy-comments': `抖音视频评论分步采集 CLI（会话制, 按步计费: 每步 1 点数）

用法: node cli.js dy-comments <子命令> [参数]

采集流程命令:
  start --url <视频链接>            建立采集会话（免费: 节点打开视频探测标题/互动数/评论总数）
                                    支持 douyin.com/video/<id>、/note/<id> 直链与 v.douyin.com
                                    短链（短链由节点浏览器打开后自动还原）
                                    返回 session_id、视频文案、评论总数、预估页数
  step --session <id> --page        采集下一页主评论（约 10-20 条+内嵌预览回复, 扣 1 点）
  step --session <id> --expand --root <主评论cid>
                                    对指定主评论展开一次回复（扣 1 点）
  status --session <id>             查询会话状态/累计采集量/点数余额
  comments --session <id> [--page N] [--page-size N]
                                    分页拉取本会话已累计的评论明细（免费, 默认 1 页 100 条）
  export --session <id> [--out <文件路径>]
                                    下载会话累计结果 CSV（免费, 含已过期会话）
  finish --session <id>             主动结束会话（释放采集节点; 空闲 20 分钟也会自动过期）
  sessions [--status active] [--page N]
                                    列出自己的会话
  quota / logout / register --link / login --link / config ...
                                    账号命令同顶层（node cli.js --help）

能采字段: 发布者昵称/IP属地/评论内容/时间/点赞数/回复@对象/评论回复。
只支持视频链接; 用户主页链接不支持; 私密/删除/审核中视频无法采集（start 失败不扣费）。

计费: 仅 step 计费（每步 1 点: 一页主评论 或 一次展开回复）; start/status/comments/
export/finish/sessions 全部免费; no_more 步不扣费; 失败步（超时/风控）点数自动返还。

交互协议: start 后必须把评论总数/预估页数报给用户确认报价后才能 step;
每步后必须询问用户是否继续/是否展开（不要擅自连续采集或展开）;
不要向终端用户泄露 session_id。

示例:
  node cli.js dy-comments start --url "https://v.douyin.com/iAbCdEf/"
  node cli.js dy-comments step --session <session_id> --page
  node cli.js dy-comments step --session <session_id> --expand --root <主评论cid>
  node cli.js dy-comments comments --session <session_id> --page 2 --page-size 50
  node cli.js dy-comments export --session <session_id> --out 评论导出.csv
  node cli.js dy-comments finish --session <session_id>

全局参数: --token <token>（临时覆盖）  --base-url <url>（默认 ${DEFAULT_BASE_URL}）`,
};

// ---------------------------------------------------------------- 账号命令 (四平台共用)

function requireToken(cfg) {
  if (!cfg.token) throw new BizError(1002, '未登录：缺少 token');
}

async function cmdSessionLink(cfg, scene) {
  const client = new ApiClient({ baseUrl: cfg.baseUrl });
  const data = await client.createCliSession();
  const isRegister = scene === 'register';
  const pageUrl = cfg.baseUrl + (isRegister ? data.register_path : data.login_path);
  const qrUrl = cfg.baseUrl + (isRegister ? data.register_qr_path : data.qr_path);
  const action = isRegister ? '注册' : '登录';
  process.stderr.write(
    `请把下面这段${action}引导原样发给用户：\n` +
    '----\n' +
    (isRegister
      ? '需要先注册账号（注册即送 10 免费点数，不注册无法使用采集服务）。请用手机扫码或打开链接注册：\n\n'
      : '需要先登录。请用手机扫码或打开链接登录账号：\n\n') +
    `${action}方式（二选一）\n` +
    `二维码图片：${qrUrl}\n` +
    `${action}链接：${pageUrl}\n` +
    `access_token（${action}后校验用）：${data.access_token}\n` +
    `扫码/${action}完成后告诉我一声，我会执行校验并保存凭证：\n\n` +
    `node cli.js ${scene} --check --access-token "${data.access_token}"\n` +
    '----\n');
  printOk({
    qr_url: qrUrl,
    [isRegister ? 'register_url' : 'login_url']: pageUrl,
    access_token: data.access_token,
    expires_in: data.expires_in,
  });
}

async function cmdSessionCheck(cfg, opts, scene) {
  const action = scene === 'register' ? '注册' : '登录';
  const accessToken = opts.accessToken;
  if (!accessToken || !/^[0-9a-f]{16,64}$/.test(accessToken)) {
    throw new UsageError(`${scene} --check 需要 --access-token（${scene} --link 下发的十六进制串）`);
  }
  const client = new ApiClient({ baseUrl: cfg.baseUrl });
  const data = await client.checkCliSession(accessToken);
  if (data.status === 'pending') {
    printFail('LOGIN_PENDING', `用户尚未完成${action}，请提醒用户完成扫码/链接${action}后再执行本命令`);
    process.exit(2);
  }
  if (data.status !== 'ready' || !data.token) {
    printFail('LOGIN_EXPIRED', `${action}会话已过期或已使用，请重新执行 ${scene} --link 发起${action}`);
    process.exit(2);
  }
  saveConfig({ base_url: cfg.baseUrl, token: data.token });
  process.stderr.write(`${action}成功，token 已保存到配置文件\n`);
  printOk({ phone: data.phone, quota_balance: data.quota_balance });
}

async function cmdQuota(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  printOk(await client.profile());
}

async function cmdLogout(opts) {
  const cfg = resolveConfig(opts);
  if (!cfg.token) throw new BizError(1002, '未登录：本地没有已保存的 token');
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  try {
    await client.logout();
  } catch (err) {
    process.stderr.write(`服务端登出异常（已忽略，继续清除本地 token）: ${err.message}\n`);
  }
  saveConfig({ token: '' });
  process.stderr.write('已登出，本地 token 已清除；可执行 login --link 登录其他账号\n');
  printOk({ logged_out: true });
}

async function cmdConfig(args, opts) {
  const sub = args[0];
  if (sub === 'set' && args[1] === 'base-url') {
    const url = args[2];
    if (!url || !/^https?:\/\//.test(url)) throw new UsageError('config set base-url 需要 http(s):// 开头的地址');
    saveConfig({ base_url: url.replace(/\/+$/, '') });
    process.stderr.write(`base_url 已保存到 ${configPaths.configPath}\n`);
    printOk({ base_url: loadConfig().base_url });
    return;
  }
  if (sub === 'set' && args[1] === 'insecure') {
    const v = args[2];
    if (v !== 'true' && v !== 'false') throw new UsageError('config set insecure 需要 true 或 false');
    saveConfig({ insecure: v === 'true' });
    process.stderr.write(`insecure 已保存到 ${configPaths.configPath}\n`);
    printOk({ insecure: loadConfig().insecure === true });
    return;
  }
  if (sub === 'show') {
    const cfg = resolveConfig(opts);
    printOk({
      base_url: cfg.baseUrl,
      insecure: cfg.insecure,
      token: maskToken(cfg.token),
      config_path: configPaths.configPath,
    });
    return;
  }
  throw new UsageError('config 仅支持: config set base-url <url> / config set insecure true|false / config show');
}

async function runAccount(cmd, args, opts) {
  switch (cmd) {
    case 'register':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'register');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'register');
      throw new UsageError('register 仅支持 --link / --check (终端注册会被 2003 拒绝)');
    case 'login':
      if (opts.link) return cmdSessionLink(resolveConfig(opts), 'login');
      if (opts.check) return cmdSessionCheck(resolveConfig(opts), opts, 'login');
      throw new UsageError('login 仅支持 --link / --check (终端登录会被 2003 拒绝)');
    case 'quota': return cmdQuota(opts);
    case 'logout': return cmdLogout(opts);
    case 'config': return cmdConfig(args, opts);
    case 'version': return printOk({ name: 'social-collect', version: VERSION, platforms: Object.keys(PLATFORMS) });
    default: throw new UsageError(`未知账号命令: ${cmd}`);
  }
}

// ---------------------------------------------------------------- 公共: 价格 / 下载

/** 读能力价格 (免登录接口); 读不到按平台兜底价, 不阻塞提交。 */
async function fetchPrice(baseUrl, plat) {
  try {
    const client = new ApiClient({ baseUrl });
    const data = await client.request('GET', '/platform/capabilities');
    const cap = ((data && data.items) || []).find((c) => c.name === plat.capability);
    if (cap && Number(cap.price) > 0) return { price: Number(cap.price), cap };
    return { price: plat.params.defaultPrice, cap: null };
  } catch {
    return { price: plat.params.defaultPrice, cap: null };
  }
}

/** 下载文件并落盘, 输出结果 JSON。 */
async function downloadToFile(cfg, url, out, extra) {
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(url,
      { headers: { Authorization: `Bearer ${cfg.token}` }, signal: dlCtrl.signal });
    if (!res.ok) {
      printFail('EXPORT_FAILED', `下载失败 HTTP ${res.status}`);
      process.exit(5);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    printFail('EXPORT_FAILED', err && err.name === 'AbortError'
      ? `下载超时（${DOWNLOAD_TIMEOUT_MS / 1000}s），请检查网络后重试`
      : `下载失败: ${err && err.message ? err.message : err}`);
    process.exit(5);
  } finally {
    clearTimeout(dlTimer);
  }
  try {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  } catch { /* 目录已存在 */ }
  if (fs.existsSync(out)) {
    process.stderr.write(`[warn] 目标文件已存在，将覆盖: ${out}\n`);
  }
  fs.writeFileSync(out, buf);
  process.stderr.write(`已下载: ${out}\n`);
  printOk({ ...extra, file: out, size: buf.length });
}

// ---------------------------------------------------------------- 链接/参数校验

function validateKeyword(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) throw new UsageError('submit 需要 --keyword <搜索关键词>');
  if (kw.length > 64) throw new UsageError(`关键词过长（${kw.length} 字符, 上限 64）`);
  if (kw.includes('xiaohongshu.com') || kw.includes('xhslink')) {
    throw new UsageError('请填写搜索关键词，不是笔记链接（采集单篇互动数请用 xhs-dpt skill）');
  }
  return kw;
}

/** 小红书博主主页链接校验 (原 xhs-profile)。 */
function validateXhsProfileUrl(url) {
  const u = String(url || '').trim();
  if (!u) throw new UsageError('需要 --url <博主主页链接>（/user/profile/<id> 或 xhslink 短链）');
  if (u.length > 2048) throw new UsageError('链接过长（上限 2048 字符）');
  if (/^https?:\/\/(www\.)?xiaohongshu\.com\/(explore|discovery\/item)\//.test(u)) {
    throw new UsageError('这是笔记链接（单篇互动数请用 xhs-dpt skill，评论请用 xhs-comments skill）；主页采集需要 /user/profile/<id> 链接');
  }
  return u;
}

/**
 * B站 UP主主页链接校验 (原 b-profile, 口径对齐服务端 parse_b_user_url):
 * - space.bilibili.com/<mid>[/video|/upload/video|/upload] 直链放行;
 * - b23.tv / bili2233.cn 短链放行 (mid 由节点浏览器导航后还原);
 * - 视频链接提示改用 b-collect / b-comments;
 * - 其它域名一律拒绝。
 */
function validateBiliProfileUrl(url) {
  const u = String(url || '').trim();
  if (!u) throw new UsageError('需要 --url <B站UP主主页链接>（space.bilibili.com/<数字ID>）');
  if (u.length > 2048) throw new UsageError('链接过长（上限 2048 字符）');
  if (/["'<>`\\\x00-\x1f\x7f\s]/.test(u)) {
    throw new UsageError('链接含不允许的字符（引号/尖括号/空白等）');
  }
  let p;
  try {
    p = new URL(u);
  } catch {
    throw new UsageError('链接格式不合法（需 http(s):// 开头的完整 URL）');
  }
  const host = p.hostname.toLowerCase();
  if (host === 'b23.tv' || host === 'www.b23.tv'
      || host === 'bili2233.cn' || host === 'www.bili2233.cn') return u; // 短链: 节点还原
  if (host === 'space.bilibili.com') {
    if (/^\/([0-9]{1,20})(?:\/(?:video|upload\/video|upload))?\/?$/.test(p.pathname)) return u;
    throw new UsageError('无法提取 UP主 ID（需 space.bilibili.com/<数字ID> 主页链接）');
  }
  if (host === 'bilibili.com' || host === 'www.bilibili.com' || host === 'm.bilibili.com') {
    throw new UsageError('这是视频链接（单稿互动数请用 b-collect skill，评论请用 b-comments skill）；主页投稿采集需要 space.bilibili.com/<数字ID> 链接');
  }
  throw new UsageError(`不是 B站主页链接（域名 ${host}）`);
}

/** 抖音会话 id 校验 (原 dy-comments)。 */
function requireSessionId(opts) {
  const sid = opts.session;
  if (!sid || !/^[0-9a-f]{32}$/.test(sid)) {
    throw new UsageError('需要 --session <32位会话id>（由 start 命令返回）');
  }
  return sid;
}

// ---------------------------------------------------------------- 任务型命令
// xhs-search submit / xhs-profile·bili-profile collect / query / export (task 模式共用)

async function cmdSubmit(opts) {
  const plat = PLATFORMS['xhs-search'];
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const keyword = validateKeyword(opts.keyword);

  // count: 1~500
  if (opts.count !== undefined && !/^\d+$/.test(String(opts.count))) {
    throw new UsageError(`--count 需为正整数（1~${plat.params.maxCount}）`);
  }
  const count = opts.count !== undefined
    ? Math.max(1, Math.min(parseInt(opts.count, 10), plat.params.maxCount))
    : plat.params.defaultCount;

  // sort: 白名单外回退 general (与服务端一致, 不拒单)
  const sort = plat.params.sortWhitelist.includes(opts.sort) ? opts.sort : 'general';

  // note_type: 0=全部 1=视频 2=图文
  if (opts.noteType !== undefined && !/^[012]$/.test(String(opts.noteType))) {
    throw new UsageError('--note-type 仅支持 0=全部 1=视频 2=图文');
  }
  const noteType = opts.noteType !== undefined ? parseInt(opts.noteType, 10) : 0;

  // 提交前读价格, 本地透出预估点数 (免登录接口, 失败兜底)
  const { price } = await fetchPrice(cfg.baseUrl, plat);
  const billUnits = Math.ceil(count / plat.params.billUnit);
  const estimatedPoints = billUnits * price;

  const items = [{ id: 1, payload: { keyword, count, sort, note_type: noteType } }];
  // 幂等键按参数派生: 同参数重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = `${keyword}|${count}|${sort}|${noteType}` + (opts.force ? `|#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);

  process.stderr.write(
    `提交搜索采集任务: 关键词="${keyword}" 数量=${count} 排序=${sort} 类型=${['全部', '视频', '图文'][noteType]}\n` +
    `计费: 预扣 ${billUnits}×${price}=${estimatedPoints} 点 (每 ${plat.params.billUnit} 条=${price} 点), ` +
    `按实采量结算退差, 零结果/失败全额返还 (幂等键 ${idempotencyKey}${opts.force ? ', force' : ''})...\n`);

  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(plat.capability, items, idempotencyKey, !!opts.force);

  // submit 响应补充本地预估信息, 供 agent 汇报
  const enriched = { ...data, estimated_points: estimatedPoints, price_per_20: price };
  if (!opts.wait) {
    printOk(enriched);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待节点采集（约 3-5 分钟）...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
  });
  process.stderr.write(
    `任务完成: status=${task.status}，实采 ${(task.items && task.items[0] && task.items[0].result
      && task.items[0].result.collected_count) || 0} 条，` +
    `请查看 result 里的 settle_charged(实收点数)/refunded_diff(退差点数) 如实汇报给用户。\n`);
  printOk(task);
}

async function cmdCollect(key, opts) {
  const plat = PLATFORMS[key];
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const profileUrl = key === 'bili-profile'
    ? validateBiliProfileUrl(opts.url) : validateXhsProfileUrl(opts.url);

  if (opts.pages !== undefined && !/^\d+$/.test(String(opts.pages))) {
    throw new UsageError(`--pages 需为正整数（1~${plat.params.maxPages}）`);
  }
  const pages = opts.pages !== undefined
    ? Math.max(1, Math.min(parseInt(opts.pages, 10), plat.params.maxPages))
    : plat.params.defaultPages;

  // 提交前读价格, 本地透出预估点数 (免登录接口, 失败兜底)
  const { price } = await fetchPrice(cfg.baseUrl, plat);
  const estimatedPoints = pages * price;

  const items = [{ id: 1, payload: { profile_url: profileUrl, pages } }];
  // 幂等键按参数派生: 同参数重试复用同键 (服务端幂等, 不重复扣费);
  // --force 时混入时间戳生成新键 (服务端同时跳过 24h 去重)
  const idemSource = `${profileUrl}|${pages}` + (opts.force ? `|#force:${Date.now()}` : '');
  const idempotencyKey = crypto.createHash('sha256').update(idemSource).digest('hex').slice(0, 32);

  process.stderr.write(
    `提交 ${plat.collect.label}采集任务: url="${profileUrl}" 页数=${pages} (约 ${pages * plat.params.billUnit} 条)\n` +
    `计费: 预扣 ${pages}×${price}=${estimatedPoints} 点 (${plat.collect.unitDesc}=${price} 点), ` +
    `按实采量结算退差, 零结果/失败/${plat.collect.failDesc}全额返还 (幂等键 ${idempotencyKey}${opts.force ? ', force' : ''})...\n`);

  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.submitTask(plat.capability, items, idempotencyKey, !!opts.force);

  // submit 响应补充本地预估信息, 供 agent 汇报
  const enriched = { ...data, estimated_points: estimatedPoints, price_per_page: price };
  if (!opts.wait) {
    printOk(enriched);
    return;
  }
  process.stderr.write(`任务已创建 task_id=${data.task_id}，等待节点采集（${plat.collect.waitDesc}）...\n`);
  const task = await pollTask(client, data.task_id, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
  });
  process.stderr.write(
    `任务完成: status=${task.status}，实采 ${(task.items && task.items[0] && task.items[0].result
      && task.items[0].result.collected_count) || 0} 条，` +
    `请查看 result 里的 settle_charged(实收点数)/refunded_diff(退差点数) 如实汇报给用户。\n`);
  printOk(task);
}

async function cmdQuery(args, opts) {
  const taskId = args[0];
  if (!taskId) throw new UsageError('query 需要 task_id 参数');
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  if (!opts.wait) {
    printOk(await client.getTask(taskId));
    return;
  }
  const task = await pollTask(client, taskId, {
    intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
    timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
  });
  printOk(task);
}

async function cmdExportTask(key, args, opts) {
  const plat = PLATFORMS[key];
  const taskId = args[0];
  if (!taskId) throw new UsageError('export 需要 task_id 参数');
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });

  // --wait: 先等任务终态 (节点采集数分钟, 默认 600s)
  if (opts.wait) {
    process.stderr.write(`等待任务 ${taskId} 完成...\n`);
    await pollTask(client, taskId, {
      intervalSec: parsePositiveNumber(opts.interval, 'interval', 5),
      timeoutSec: parsePositiveNumber(opts.timeout, 'timeout', 600),
    });
  }

  const created = await client.createExport(taskId);
  if (!opts.wait) {
    printOk(created);
    return;
  }
  process.stderr.write(`导出任务已创建 export_id=${created.export_id}，等待生成...\n`);
  // 复用 --timeout (默认 300s), 超时报 TIMEOUT 退出码 5 (对齐 pollTask 风格)
  const timeoutSec = 300;
  const deadline = Date.now() + timeoutSec * 1000;
  let info;
  for (;;) {
    info = await client.getExport(created.export_id);
    if (info.status !== 'pending' && info.status !== 'running') break;
    if (Date.now() + 1000 > deadline) {
      printFail('TIMEOUT', `等待导出超时（${timeoutSec}s），导出仍为 ${info.status} 状态，可稍后重试 export ${taskId}`);
      process.exit(5);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (info.status !== 'done') {
    printFail('EXPORT_FAILED', `导出未完成 (status=${info.status}), 请稍后重试`);
    process.exit(5);
  }
  await downloadToFile(cfg, `${cfg.baseUrl}/api/v1/platform/exports/${encodeURIComponent(info.export_id)}/file`,
    opts.out || `${taskId}_${plat.exportSuffix}`, { export_id: info.export_id });
}

// ---------------------------------------------------------------- xhs-profile 会话模式

async function cmdProfileSession(args, opts) {
  const plat = PLATFORMS['xhs-profile'];
  const sub = args[0];
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });

  if (sub === 'start') {
    const profileUrl = validateXhsProfileUrl(opts.url);
    const { price } = await fetchPrice(cfg.baseUrl, plat);
    process.stderr.write(
      `建主页采集会话（免费）: url="${profileUrl}"\n` +
      `计费: 建会话免费; 之后每步一页（30 条）= ${price} 点, 无更多 (no_more) 不扣费; ` +
      `博主被封/采集失败返还本步点数。\n`);
    const data = await client.createProfileSession(profileUrl);
    process.stderr.write(
      `会话已创建 session_id=${data.session_id}。\n` +
      `下一步: node cli.js xhs-profile session step ${data.session_id}（每步一页 30 条 = ${price} 点；` +
      `首步返回博主昵称与笔记总数）。\n`);
    printOk(data);
    return;
  }

  if (sub === 'step') {
    const sid = args[1];
    if (!sid) throw new UsageError('session step 需要 session_id 参数');
    process.stderr.write(`步进采集一页（30 条 = 1 点）session=${sid}...\n`);
    const data = await client.stepProfileSession(sid);
    if (data.no_more) {
      process.stderr.write('已没有更多笔记（本步未扣费）。可 session finish 结束会话释放节点。\n');
    } else {
      process.stderr.write(
        `第 ${data.page_no} 页完成: 新增 ${(data.notes || []).length} 条, ` +
        `累计 ${data.notes_collected} 条, has_more=${data.has_more}, 余额=${data.quota_balance}。\n`);
    }
    printOk(data);
    return;
  }

  if (sub === 'status') {
    const sid = args[1];
    if (!sid) throw new UsageError('session status 需要 session_id 参数');
    printOk(await client.getProfileSession(sid));
    return;
  }

  if (sub === 'list') {
    printOk(await client.listProfileSessions(
      parseInt(opts.page || '1', 10) || 1,
      parseInt(opts.pageSize || '20', 10) || 20,
      opts.status || ''));
    return;
  }

  if (sub === 'notes') {
    const sid = args[1];
    if (!sid) throw new UsageError('session notes 需要 session_id 参数');
    printOk(await client.listProfileSessionNotes(sid,
      parseInt(opts.page || '1', 10) || 1,
      parseInt(opts.pageSize || '100', 10) || 100));
    return;
  }

  if (sub === 'export') {
    const sid = args[1];
    if (!sid) throw new UsageError('session export 需要 session_id 参数');
    const out = opts.out || `${sid}_profile_notes.csv`;
    await downloadToFile(cfg,
      `${cfg.baseUrl}/api/v1/profile/sessions/${encodeURIComponent(sid)}/export`,
      out, { session_id: sid });
    return;
  }

  if (sub === 'finish') {
    const sid = args[1];
    if (!sid) throw new UsageError('session finish 需要 session_id 参数');
    const data = await client.finishProfileSession(sid);
    process.stderr.write(`会话已结束 (status=${data.status})，节点已释放。\n`);
    printOk(data);
    return;
  }

  throw new UsageError('session 仅支持: start / step / status / list / notes / export / finish');
}

// ---------------------------------------------------------------- dy-comments 会话制

async function cmdDyStart(opts) {
  const url = opts.url;
  if (!url) throw new UsageError('start 需要 --url <抖音视频链接>（douyin.com/video/<id> 直链或 v.douyin.com 短链，节点自动还原）');
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  process.stderr.write('建立采集会话（节点探测视频信息，免费）...\n');
  const data = await client.createDyCommentSession(url);
  // 引导 AI: 必须把评论数/预估页数报给用户确认后再开始计费步进
  const total = data.metrics && data.metrics.comment_count;
  process.stderr.write(
    `会话已建立 session_id=${data.session_id}\n` +
    `视频《${data.title || '(无文案)'}》评论总数: ${total || '未知'}, ` +
    `预估 ${data.estimated_pages == null ? '?' : data.estimated_pages} 页主评论 (每页约 10 条 = 1 点)。\n` +
    '请把评论数和预估页数告知用户, 确认后再执行 step 开始计费采集；' +
    '每页采完会返回可展开回复的主评论列表, 由用户决定是否展开 (每次展开 1 点)。\n');
  printOk(data);
}

async function cmdDyStep(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  let data;
  if (opts.expand) {
    const root = opts.root;
    if (!root || root === true) throw new UsageError('step --expand 需要 --root <主评论cid>（取自上一步返回的 expandable 列表）');
    process.stderr.write(`展开回复: session=${sessionId} root=${root}（扣 1 点）...\n`);
    data = await client.stepDyCommentSession(sessionId, 'expand', root);
    if (data.no_more) {
      process.stderr.write('该主评论的回复已全部展开完（本次未扣费）。\n');
    } else {
      process.stderr.write(
        `本次展开 ${(data.comments || []).length} 条回复, 该主评论累计 ${data.subs_collected_for_root} 条, ` +
        `约剩 ${data.subs_remaining_estimate == null ? '?' : data.subs_remaining_estimate} 条, ` +
        `${data.sub_has_more ? '还有更多（继续展开需再扣 1 点, 请先询问用户）' : '已全部展开'}。\n`);
    }
  } else {
    process.stderr.write(`采集下一页主评论: session=${sessionId}（扣 1 点）...\n`);
    data = await client.stepDyCommentSession(sessionId, 'page');
    if (data.no_more) {
      process.stderr.write('主评论已全部采完（本次未扣费）。\n');
    } else {
      const ex = Array.isArray(data.expandable) ? data.expandable : [];
      process.stderr.write(
        `第 ${data.page_no} 页: ${(data.comments || []).length} 条主评论 ` +
        `(累计 ${data.mains_collected} 主 + ${data.subs_collected} 子), ` +
        `${data.has_more_main ? '还有下一页' : '已是最后一页'}。\n` +
        (ex.length
          ? `本页有 ${ex.length} 条主评论含可展开回复: ` +
            ex.map((e) => `${e.root_cid}(共${e.sub_count}条,已采${e.subs_collected})`).join(', ') +
            ' — 是否展开请询问用户（每次展开 1 点）。\n'
          : '本页主评论均无可展开回复。\n'));
    }
  }
  printOk(data);
}

async function cmdDyStatus(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  printOk(await client.getDyCommentSession(sessionId));
}

async function cmdDyComments(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  // 无值形态 (--page 不带数字) 视为开关, 用默认页码 (parseArgs lenient 对缺值 value-flag 置 true)
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  const pageSize = opts.pageSize === true ? 100 : parsePositiveNumber(opts.pageSize, 'page-size', 100);
  printOk(await client.listDySessionComments(sessionId, page, pageSize));
}

async function cmdDyFinish(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const data = await client.finishDyCommentSession(sessionId);
  process.stderr.write(`会话已结束 (status=${data.status})，采集节点已释放。\n`);
  printOk(data);
}

async function cmdDySessions(opts) {
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const client = new ApiClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const page = opts.page === true ? 1 : parsePositiveNumber(opts.page, 'page', 1);
  printOk(await client.listDyCommentSessions(page, 20, opts.status || ''));
}

async function cmdDyExport(opts) {
  const sessionId = requireSessionId(opts);
  const cfg = resolveConfig(opts);
  requireToken(cfg);
  const dlCtrl = new AbortController();
  const dlTimer = setTimeout(() => dlCtrl.abort(), DOWNLOAD_TIMEOUT_MS);
  let buf;
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v1/dy/comments/sessions/${encodeURIComponent(sessionId)}/export`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, signal: dlCtrl.signal });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch { /* 非信封 */ }
      printFail('EXPORT_FAILED', `导出失败: ${msg}`);
      process.exit(5);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    printFail('EXPORT_FAILED', err && err.name === 'AbortError'
      ? `下载超时（${DOWNLOAD_TIMEOUT_MS / 1000}s），请检查网络后重试`
      : `下载失败: ${err && err.message ? err.message : err}`);
    process.exit(5);
  } finally {
    clearTimeout(dlTimer);
  }
  const plat = PLATFORMS['dy-comments'];
  const out = opts.out || `${sessionId}_${plat.exportSuffix}`;
  try {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  } catch { /* 目录已存在 */ }
  if (fs.existsSync(out)) {
    process.stderr.write(`[warn] 目标文件已存在，将覆盖: ${out}\n`);
  }
  fs.writeFileSync(out, buf);
  process.stderr.write(`已下载: ${out}\n`);
  printOk({ session_id: sessionId, file: out, size: buf.length });
}

// ---------------------------------------------------------------- 平台分发

async function runPlatform(key, cmd, args, opts) {
  if (opts.version) {
    return printOk({ name: `social-collect/${key}`, version: VERSION, capability: PLATFORMS[key].capability });
  }
  if (ACCOUNT_CMDS.has(cmd)) return runAccount(cmd, args, opts);
  switch (key) {
    case 'xhs-search':
      switch (cmd) {
        case 'submit': return cmdSubmit(opts);
        case 'query': return cmdQuery(args, opts);
        case 'export': return cmdExportTask(key, args, opts);
        default: throw new UsageError(cmd ? `xhs-search 未知子命令: ${cmd}` : 'xhs-search 缺少子命令');
      }
    case 'xhs-profile':
      switch (cmd) {
        case 'collect': return cmdCollect(key, opts);
        case 'query': return cmdQuery(args, opts);
        case 'export': return cmdExportTask(key, args, opts);
        case 'session': return cmdProfileSession(args, opts);
        default: throw new UsageError(cmd ? `xhs-profile 未知子命令: ${cmd}` : 'xhs-profile 缺少子命令');
      }
    case 'bili-profile':
      switch (cmd) {
        case 'collect': return cmdCollect(key, opts);
        case 'query': return cmdQuery(args, opts);
        case 'export': return cmdExportTask(key, args, opts);
        default: throw new UsageError(cmd ? `bili-profile 未知子命令: ${cmd}` : 'bili-profile 缺少子命令');
      }
    case 'dy-comments':
      switch (cmd) {
        case 'start': return cmdDyStart(opts);
        case 'step': return cmdDyStep(opts);
        case 'status': return cmdDyStatus(opts);
        case 'comments': return cmdDyComments(opts);
        case 'export': return cmdDyExport(opts);
        case 'finish': return cmdDyFinish(opts);
        case 'sessions': return cmdDySessions(opts);
        default: throw new UsageError(cmd ? `dy-comments 未知子命令: ${cmd}` : 'dy-comments 缺少子命令');
      }
    default: throw new UsageError(`未知平台命令: ${key}`);
  }
}

// ---------------------------------------------------------------- 入口

async function main() {
  const argv = process.argv.slice(2);
  const first = argv[0];
  if (!first || first === '--help') {
    process.stdout.write(TOP_USAGE + '\n');
    return;
  }
  if (PLATFORMS[first]) {
    const { cmd, args, opts } = parseArgs(argv.slice(1), PLATFORMS[first].flags);
    if (opts.help) {
      process.stdout.write(PLATFORM_USAGE[first] + '\n');
      return;
    }
    if (resolveConfig(opts).insecure) allowInsecureTls();
    try {
      await runPlatform(first, cmd, args, opts);
    } catch (e) {
      if (e instanceof UsageError && !e.usage) e.usage = PLATFORM_USAGE[first];
      throw e;
    }
    return;
  }
  const { cmd, args, opts } = parseArgs(argv, ACCOUNT_FLAGS);
  if (opts.help) {
    process.stdout.write(TOP_USAGE + '\n');
    return;
  }
  if (resolveConfig(opts).insecure) allowInsecureTls();
  if (!cmd) throw new UsageError('缺少命令');
  if (ACCOUNT_CMDS.has(cmd)) return runAccount(cmd, args, opts);
  throw new UsageError(`未知命令: ${cmd}（平台命令: ${Object.keys(PLATFORMS).join(' / ')}；node cli.js --help 查看用法）`);
}

main().catch((e) => exitWithError(e, { usage: e.usage || TOP_USAGE }));
