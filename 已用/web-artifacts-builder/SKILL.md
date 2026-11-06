---
name: web-artifacts-builder
description: 用于创建复杂、多组件 claude.ai HTML artifact 的工具套件，采用现代前端 Web 技术（React、Tailwind CSS、shadcn/ui）。适用于需要状态管理、路由或 shadcn/ui 组件的复杂 artifact——不适用于简单的单文件 HTML/JSX artifact。
license: Complete terms in LICENSE.txt
---

# Web Artifacts Builder

要构建强大的前端 claude.ai artifact，请遵循以下步骤：
1. 使用 `scripts/init-artifact.sh` 初始化前端仓库
2. 通过编辑生成的代码来开发你的 artifact
3. 使用 `scripts/bundle-artifact.sh` 将所有代码打包成单个 HTML 文件
4. 向用户展示 artifact
5. （可选）测试 artifact

**技术栈**：React 18 + TypeScript + Vite + Parcel（打包）+ Tailwind CSS + shadcn/ui

## 设计与风格指南

非常重要：为避免通常所说的 "AI slop"（AI 味粗制滥造），避免过度使用居中布局、紫色渐变、统一的圆角和 Inter 字体。

## 快速开始

### 第 1 步：初始化项目

运行初始化脚本以创建新的 React 项目：
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

这会创建一个完全配置好的项目，包含：
- ✅ React + TypeScript（通过 Vite）
- ✅ Tailwind CSS 3.4.1，带 shadcn/ui 主题系统
- ✅ 已配置路径别名（`@/`）
- ✅ 预装 40+ 个 shadcn/ui 组件
- ✅ 包含全部 Radix UI 依赖
- ✅ 已配置 Parcel 用于打包（通过 .parcelrc）
- ✅ 兼容 Node 18+（自动检测并锁定 Vite 版本）

### 第 2 步：开发你的 Artifact

要构建 artifact，编辑生成的文件。相关指导请见下方的 **Common Development Tasks**（常见开发任务）。

### 第 3 步：打包为单个 HTML 文件

要把 React 应用打包成单个 HTML artifact：
```bash
bash scripts/bundle-artifact.sh
```

这会生成 `bundle.html`——一个自包含的 artifact，所有 JavaScript、CSS 和依赖都已内联。该文件可以直接作为 artifact 在 Claude 对话中分享。

**要求**：你的项目必须在根目录有一个 `index.html`。

**脚本执行的操作**：
- 安装打包依赖（parcel、@parcel/config-default、parcel-resolver-tspaths、html-inline）
- 创建支持路径别名的 `.parcelrc` 配置
- 用 Parcel 构建（不生成 source map）
- 使用 html-inline 将所有资源内联到单个 HTML

### 第 4 步：与用户分享 Artifact

最后，在对话中与用户分享打包好的 HTML 文件，使其可以作为 artifact 查看。

### 第 5 步：测试/可视化 Artifact（可选）

注意：这是完全可选的步骤。仅在必要或被要求时执行。

要测试/可视化 artifact，使用可用的工具（包括其他 Skills 或 Playwright、Puppeteer 等内置工具）。通常应避免提前测试 artifact，因为这会增加从请求到能看到成品 artifact 之间的延迟。如有要求或出现问题，可在展示 artifact 之后再测试。

## 参考

- **shadcn/ui 组件**：https://ui.shadcn.com/docs/components
