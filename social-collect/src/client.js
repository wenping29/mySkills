'use strict';
/**
 * client.js — 平台 /api/v1 API 客户端 (4 个原 skill 核心实现一致, 合并为一份)。
 *
 * - 内置全局 fetch, 单次请求默认 15s 超时 (AbortController), opts.timeoutMs 可覆盖
 * - 统一信封 {"code","message","data"}: code !== 0 抛 BizError
 * - HTTP 层失败 (连接拒绝/超时/非信封响应) 抛 NetworkError
 * - 会话端点按平台分支: xhs-profile 用 /profile/sessions, dy-comments 用 /dy/comments/sessions
 *   (步进展开参数: dy 为 root_cid)
 */
const REQUEST_TIMEOUT_MS = 15000;

let _insecureNoted = false;
let _httpWarned = false;

/** 忽略 HTTPS 证书校验 (服务端自签/域名不匹配证书时由 insecure 配置开启)。进程级。 */
function allowInsecureTls() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/** 业务错误: code 为后端错误码 (1001/1002/3001/...) */
class BizError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BizError';
    this.code = code;
  }
}

/** 网络/服务不可达错误 */
class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
    this.code = 'NETWORK_ERROR';
  }
}

class ApiClient {
  /** @param {{baseUrl: string, token?: string}} opts */
  constructor({ baseUrl, token }) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.token = token || '';
  }

  /** 发起 API 请求, 成功返回信封 data。opts.timeoutMs 可覆盖默认 15s 超时。 */
  async request(method, apiPath, opts = {}) {
    const { body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = opts;
    // 明文 http + 携带 token 时提示一次 (每进程仅一次), 不打断请求
    if (!_httpWarned && this.token && this.baseUrl.startsWith('http://')) {
      _httpWarned = true;
      process.stderr.write('[warn] 当前服务地址为明文 http，token 会明文传输，建议确认网络安全或切换 https\n');
    }
    // insecure 生效时, 对每个 https 目标域名明确提示证书校验已关闭 (审计 S-P2-2)
    if (!_insecureNoted && this.baseUrl.startsWith('https://')
        && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      _insecureNoted = true;
      process.stderr.write(`[warn] 目标 ${this.baseUrl} 的 HTTPS 证书校验已关闭（insecure=true），存在中间人风险，请确认网络环境\n`);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    let payload = null;
    try {
      res = await fetch(this.baseUrl + '/api/v1' + apiPath, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      try {
        payload = await res.json();
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        /* 非 JSON 响应, 按 HTTP 层错误处理 */
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new NetworkError(`请求超时（${Math.round(timeoutMs / 1000)}s）: ${this.baseUrl}`);
      }
      throw new NetworkError(`无法连接后端服务 ${this.baseUrl}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (payload && typeof payload.code === 'number') {
      if (payload.code === 0) return payload.data;
      throw new BizError(payload.code, payload.message || `业务错误 code=${payload.code}`);
    }
    if (res.status === 429) throw new BizError(4290, '触发限流，请稍后重试');
    throw new NetworkError(`后端返回异常响应 HTTP ${res.status}（期望统一信封 JSON）`);
  }

  // ---- auth ----
  // (终端无法展示图形/短信验证码, register/login 一律走 --link, 无对应遗留方法)
  logout() {
    return this.request('POST', '/auth/logout');
  }
  createCliSession() {
    return this.request('POST', '/auth/cli-session');
  }
  checkCliSession(accessToken) {
    return this.request('POST', '/auth/cli-session/check', { body: { access_token: accessToken } });
  }

  // ---- user ----
  profile() {
    return this.request('GET', '/user/profile');
  }

  // ---- tasks (xhs-search / xhs-profile 整单 / bili-profile 共用) ----
  submitTask(capability, items, idempotencyKey, force = false) {
    return this.request('POST', '/platform/tasks', {
      body: { capability, items, force },
      headers: { 'X-Idempotency-Key': idempotencyKey },
    });
  }
  getTask(taskId) {
    return this.request('GET', `/platform/tasks/${encodeURIComponent(taskId)}`);
  }
  createExport(taskId) {
    return this.request('POST', `/platform/tasks/${encodeURIComponent(taskId)}/export`);
  }
  getExport(exportId) {
    return this.request('GET', `/platform/exports/${encodeURIComponent(exportId)}`);
  }

  // ---- profile session (xhs-profile 分步会话采集) ----
  createProfileSession(url) {
    // 建会话内含短链还原 (服务端串行 HTTP), 放宽超时
    return this.request('POST', '/profile/sessions', { body: { url }, timeoutMs: 90000 });
  }
  getProfileSession(sessionId) {
    return this.request('GET', `/profile/sessions/${encodeURIComponent(sessionId)}`);
  }
  listProfileSessions(page = 1, pageSize = 20, status = '') {
    const q = `?page=${page}&page_size=${pageSize}` +
      (status ? `&status=${encodeURIComponent(status)}` : '');
    return this.request('GET', '/profile/sessions' + q);
  }
  stepProfileSession(sessionId) {
    // 步进服务端最长执行 ~180s (滚动一页 + 节点回传), 放宽超时
    return this.request('POST', `/profile/sessions/${encodeURIComponent(sessionId)}/step`, {
      body: {}, timeoutMs: 200000,
    });
  }
  finishProfileSession(sessionId) {
    return this.request('POST', `/profile/sessions/${encodeURIComponent(sessionId)}/finish`);
  }
  listProfileSessionNotes(sessionId, page = 1, pageSize = 100) {
    return this.request('GET',
      `/profile/sessions/${encodeURIComponent(sessionId)}/notes?page=${page}&page_size=${pageSize}`);
  }

  // ---- dy comments session (dy-comments 分步会话采集) ----
  // 步进参数为 root_cid; 建会话内含节点免费 probe 探测, 放宽超时
  createDyCommentSession(url) {
    return this.request('POST', '/dy/comments/sessions', { body: { url }, timeoutMs: 90000 });
  }
  getDyCommentSession(sessionId) {
    return this.request('GET', `/dy/comments/sessions/${encodeURIComponent(sessionId)}`);
  }
  listDyCommentSessions(page = 1, pageSize = 20, status = '') {
    const q = `?page=${page}&page_size=${pageSize}` +
      (status ? `&status=${encodeURIComponent(status)}` : '');
    return this.request('GET', '/dy/comments/sessions' + q);
  }
  stepDyCommentSession(sessionId, type, rootCid = '') {
    // 步进服务端最长执行 ~180s (滚动一页/展开一次 + 节点回传), 放宽超时
    return this.request('POST', `/dy/comments/sessions/${encodeURIComponent(sessionId)}/step`, {
      body: { type, root_cid: rootCid }, timeoutMs: 200000,
    });
  }
  finishDyCommentSession(sessionId) {
    return this.request('POST', `/dy/comments/sessions/${encodeURIComponent(sessionId)}/finish`);
  }
  listDySessionComments(sessionId, page = 1, pageSize = 100) {
    return this.request('GET',
      `/dy/comments/sessions/${encodeURIComponent(sessionId)}/comments?page=${page}&page_size=${pageSize}`);
  }
}

module.exports = { ApiClient, BizError, NetworkError, REQUEST_TIMEOUT_MS, allowInsecureTls };
