# 步骤 5：系统架构与模块化设计（细则）

基于重构目标设计新架构，输出架构设计文档与模块拆分方案。

- 定义模块边界、接口契约、依赖方向；规划组件拆分与通信机制
- 面向扩展设计（插件化、微服务化按需）；输出 Mermaid 架构图（模块关系/分层/数据流）
- **规则**：安全与可扩展性优先；YAGNI 极简主义；默认 Docker 容器化；示例代码遵循严格 lint

**语言标准**
- Python（PEP 8）：snake_case 变量/函数、PascalCase 类、4 空格缩进、88 列；`src/` + `tests/` + `pyproject.toml`；black/ruff + pylint + mypy strict
- JS/TS：camelCase 变量、PascalCase 类/组件、2 空格、分号；避免 `any`（用 `unknown`）、对象形状用 `interface`、`strict: true`；eslint + prettier

**脚手架**：Python 用 `src/<pkg>/` + `tests/` + `pyproject.toml` + `.env.example`；JS/TS 用 `src/` + `tests/` + `package.json` + `tsconfig.json` + `.eslintrc.json`；monorepo 用 `apps/` + `packages/`，非必要不 monorepo。

**安全检查清单（OWASP）**：代码与 git 无密钥（用 `.env`）；依赖审计（`npm audit`/`pip-audit`）；全站 HTTPS；SQL 参数化/ORM；限流；输入校验（Joi/Zod）；XSS 净化；Docker 非 root、固定基础镜像版本、minimal 镜像。

**模板**：新项目文档骨架见 `assets/templates/README.md`、`assets/templates/ARCHITECTURE.md`。

深入阅读：`references/python-standards.md`、`references/js-ts-standards.md`、`references/scaffolding.md`、`references/security-checklist.md`
