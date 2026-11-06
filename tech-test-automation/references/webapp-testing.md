# Webapp Testing — 本地 Web 应用 Playwright 自动化测试模式

> 源自 design-and-docs / Frontend Design_skills-main 的 webapp-testing。定位：对**本地运行的 Web 应用**编写原生 Python Playwright 脚本做功能验证、UI 调试、截图与日志采集。跨浏览器 E2E 编排与测试框架设计走 skillsets 主线步骤 4。

## 脚本资产（相对本文件路径）

| 文件 | 用途 |
|------|------|
| `../scripts/webapp/with_server.py` | 管理本地服务器生命周期（支持多服务器） |
| `../scripts/webapp/element_discovery.py` | 页面按钮/链接/输入框发现 |
| `../scripts/webapp/static_html_automation.py` | 用 `file://` URL 测试静态 HTML |
| `../scripts/webapp/console_logging.py` | 自动化过程中采集浏览器控制台日志 |

**使用原则**：`with_server.py` 等脚本当黑盒用——**先跑 `python ../scripts/webapp/with_server.py --help` 看用法，再直接调用**，不要先读源码（脚本较大，会污染上下文）。

## 决策树：选择做法

```
任务 → 是静态 HTML 吗？
    ├─ 是 → 直接读 HTML 文件定位选择器
    │        ├─ 成功 → 用选择器写 Playwright 脚本
    │        └─ 失败/不完整 → 按动态应用处理（下方）
    └─ 否（动态 webapp）→ 服务器已在运行吗？
        ├─ 否 → 用 with_server.py 托管服务器 + 写简化 Playwright 脚本
        └─ 是 → 先侦察后行动（见下方模式）
```

## 用 with_server.py 托管服务器

**单服务器：**
```bash
python ../scripts/webapp/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**多服务器（后端 + 前端）：**
```bash
python ../scripts/webapp/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

自动化脚本只写 Playwright 逻辑，服务器由 helper 自动启停。

## 基础脚本骨架

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)  # 始终 headless 启动 chromium
    page = browser.new_page()
    page.goto('http://localhost:5173')           # 服务器已就绪
    page.wait_for_load_state('networkidle')      # 关键：等 JS 执行完
    # ... 自动化逻辑 ...
    browser.close()
```

## 先侦察后行动（Reconnaissance-then-Action）

1. **检查渲染后的 DOM**：
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   ```
2. 从侦察结果**识别选择器**
3. 用发现的选择器**执行动作**

## 常见坑

❌ 动态应用不等加载完成就检查 DOM
✅ 检查/操作前先 `page.wait_for_load_state('networkidle')`

## 最佳实践

- 优先复用 `../scripts/webapp/` 下的黑盒脚本处理通用流程（起服务、元素发现、日志采集）
- 用同步 API（`sync_playwright()`）写脚本；结束时务必关闭浏览器
- 用描述性选择器：`text=`、`role=`、CSS 选择器、ID
- 适时加显式等待：`page.wait_for_selector()` 或 `page.wait_for_timeout()`
