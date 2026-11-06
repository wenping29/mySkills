'use strict';
/**
 * config.js — 配置读写 + 平台定义 (social-collect 统一, 合并自 4 个 skill)。
 *
 * 配置路径: ~/.xhs-platform/config.json (用户级, 升级/重装不丢; 四平台共用同一账号体系)。
 * 旧凭证迁移: 首次运行时若旧 ~/.xhs-convert/config.json 存在且新配置无 token,
 * 自动复制 token/base_url/insecure (只读迁移, 不删除/不修改旧文件)。
 * 优先级: --base-url/--token 参数 > 环境变量 > 配置文件 > 内置默认。
 * 安全: 本文件不含任何账号/token/密钥, 凭证仅来自用户级配置文件与环境变量占位符。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// 安全说明 (审计 S-P2-1): 服务端 https 证书尚未配好 (实测 ERR_TLS_CERT_ALTNAME_INVALID),
// 切默认 https 会导致所有用户连不上, 故暂保持 http 默认; 风险已在 SKILL.md 显著标注。
// 服务端配好证书后应第一时间改此处为 https。
const DEFAULT_BASE_URL = 'http://st.aidata366.com';
// 配置路径解析: XHS_CONFIG_PATH 环境变量 (完整文件路径) > ~/.xhs-platform/config.json。
// 用于测试隔离 / 多账号切换; 未设置时保持用户级默认路径 (升级/重装不丢)。
const CONFIG_PATH = process.env.XHS_CONFIG_PATH
  || path.join(os.homedir(), '.xhs-platform', 'config.json');
const CONFIG_DIR = path.dirname(CONFIG_PATH);
const LEGACY_CONFIG_PATH = path.join(os.homedir(), '.xhs-convert', 'config.json');

function ensureDir() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch { /* 目录已存在 */ }
  // 尽力收紧目录权限 (Windows 上 chmod 语义有限, 失败忽略, 不影响主流程)
  try {
    fs.chmodSync(CONFIG_DIR, 0o700);
  } catch { /* 不支持时忽略 */ }
}

/** 读取配置; 不存在/损坏按空配置。 */
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** 合并写配置 (保留未涉及字段)。 */
function saveConfig(patch) {
  ensureDir();
  const next = { ...loadConfig(), ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  // 配置文件含 token, 尽力收紧为仅本人可读写 (Windows 上 chmod 语义有限, 失败忽略)
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch { /* 不支持时忽略 */ }
  return next;
}

/**
 * 旧转链凭证只读迁移 (R6-2): 新配置缺 token 且旧配置存在时, 复制
 * token/base_url/insecure 进新配置 (insecure 仅在旧值为 true 时带入)。
 * 迁移只发生一次 (写入后不再读取旧文件)。
 */
function migrateLegacyToken() {
  const cur = loadConfig();
  if (cur.token) return false;
  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8'));
  } catch {
    return false;
  }
  if (!legacy || !legacy.token) return false;
  const patch = { token: legacy.token };
  if (legacy.base_url) patch.base_url = legacy.base_url; // 转链地址仅兜底展示, submit 前应 config set base-url
  if (legacy.insecure === true) patch.insecure = true;
  saveConfig(patch);
  process.stderr.write(`[migrate] 已从旧配置迁移登录凭证: ${LEGACY_CONFIG_PATH} -> ${CONFIG_PATH}\n`);
  process.stderr.write('[migrate] 注意: 转链与采集是两个服务, 若地址不同请执行 config set base-url <采集服务地址>\n');
  return true;
}

/** 解析生效配置。 */
function resolveConfig(overrides = {}) {
  // 旧凭证迁移 (审计 P3-4): 带 --token 显式覆盖时跳过 —— 此时不需要迁移,
  // 也不应读取另一个 skill 的旧配置 (更不应把其 insecure:true 带入本会话)
  if (overrides.token === undefined) migrateLegacyToken();
  const file = loadConfig();
  return {
    baseUrl: overrides.baseUrl || process.env.XHS_PLATFORM_BASE_URL || file.base_url || DEFAULT_BASE_URL,
    token: overrides.token !== undefined ? overrides.token : (file.token || ''),
    insecure: process.env.XHS_PLATFORM_INSECURE === '1' || file.insecure === true,
  };
}

/** token 脱敏。 */
function maskToken(token) {
  if (!token) return null;
  return token.length > 12 ? token.slice(0, 12) + '...' : token.slice(0, 4) + '...';
}

// ---------------------------------------------------------------- 平台定义
// 合并自 4 个 skill 的端点与参数定义, 按平台键索引。

const PLATFORMS = {
  // 小红书关键词搜索采集 (一次性任务, 原 xhs-search skill)
  'xhs-search': {
    capability: 'xhs_search',
    mode: 'task',
    endpoints: {
      tasks: '/platform/tasks',
      exports: '/platform/exports',
    },
    params: {
      maxCount: 500,          // 单任务采集条数上限 (服务端 search.max_count)
      defaultCount: 50,
      billUnit: 20,           // 计费粒度: 一次接口返回的主帖数
      defaultPrice: 1,        // capability_prices 兜底价 (读不到时)
      sortWhitelist: ['general', 'time_descending', 'popularity_descending',
        'comment_descending', 'collect_descending'],
    },
    exportSuffix: 'search_notes.csv',
    priceField: 'price_per_20',
    flags: {
      value: ['keyword', 'count', 'sort', 'note-type', 'interval', 'timeout',
        'token', 'base-url', 'access-token', 'out'],
      bool: ['wait', 'help', 'link', 'check', 'force', 'version'],
      lenient: false,
    },
  },
  // 小红书博主主页笔记采集 (整单 + 会话, 原 xiaohs-profile skill)
  'xhs-profile': {
    capability: 'xhs_profile',
    mode: 'task+session',
    endpoints: {
      tasks: '/platform/tasks',
      exports: '/platform/exports',
      sessions: '/profile/sessions',
    },
    params: {
      maxPages: 10,           // 单任务采集页数上限 (服务端 profile.max_pages)
      defaultPages: 1,
      billUnit: 30,           // 计费粒度: 一页的主帖数 (user_posted num=30 实测)
      defaultPrice: 1,
    },
    collect: {
      label: '博主主页',
      unitDesc: '每页 30 条',
      failDesc: '博主被封',
      waitDesc: '每页约 5-10 秒',
    },
    exportSuffix: 'profile_notes.csv',
    priceField: 'price_per_page',
    flags: {
      value: ['url', 'pages', 'page', 'page-size', 'status', 'interval', 'timeout',
        'token', 'base-url', 'access-token', 'out'],
      bool: ['wait', 'help', 'link', 'check', 'force', 'version'],
      lenient: false,
    },
  },
  // B站UP主主页投稿采集 (一次性任务, 原 b-profile skill)
  'bili-profile': {
    capability: 'b_profile',
    mode: 'task',
    endpoints: {
      tasks: '/platform/tasks',
      exports: '/platform/exports',
    },
    params: {
      maxPages: 10,           // 单任务采集页数上限 (服务端 b_profile.max_pages)
      defaultPages: 1,
      billUnit: 42,           // 计费粒度: 一页的投稿数 (B站分页式, 实测≈42)
      defaultPrice: 1,
    },
    collect: {
      label: 'B站主页',
      unitDesc: '每页约 42 条',
      failDesc: '主页不可见',
      waitDesc: '每页约 10-20 秒',
    },
    exportSuffix: 'b_profile_videos.csv',
    priceField: 'price_per_page',
    flags: {
      value: ['url', 'pages', 'interval', 'timeout',
        'token', 'base-url', 'access-token', 'out'],
      bool: ['wait', 'help', 'link', 'check', 'force', 'version'],
      lenient: false,
    },
  },
  // 抖音视频评论采集·分步会话制 (原 dy-comments skill)
  'dy-comments': {
    capability: 'dy_comments',
    mode: 'session',
    endpoints: {
      sessions: '/dy/comments/sessions',
    },
    params: {
      billUnit: 1,            // 每步 1 点数 (一页主评论 或 一次展开回复)
    },
    stepRootField: 'root_cid', // 步进展开参数 (xhs 评论会话为 root_comment_id)
    exportSuffix: 'dy_comments.csv',
    flags: {
      value: ['session', 'root', 'url', 'page', 'page-size', 'status',
        'token', 'base-url', 'access-token', 'out'],
      bool: ['help', 'link', 'check', 'version', 'expand'],
      lenient: true,          // --page 等 value-flag 允许无值布尔开关形态 (step --page)
    },
  },
};

module.exports = {
  DEFAULT_BASE_URL, CONFIG_PATH, LEGACY_CONFIG_PATH, configPaths: { configPath: CONFIG_PATH },
  loadConfig, saveConfig, resolveConfig, maskToken, migrateLegacyToken, PLATFORMS,
};
