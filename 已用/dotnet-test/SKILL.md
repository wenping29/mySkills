---
name: "dotnet-test"
description: ".NET 测试技能：测试编写与脚手架、MSTest 写法修正、断言质量、标签分类、运行命令与过滤器语法、平台判定、MTP 热重载、覆盖率/CRAP/评分/反模式/smell/行为盲区/变更红绿证据、静态依赖检测与可测性改造、MSTest v1/v2→v3→v4 升级、NUnit/xUnit→MSTest 转换、xUnit v2→v3、VSTest→MTP 运行器迁移。当用户要求写/修/跑 .NET 测试、生成测试工程、分析测试质量或覆盖率、迁移测试框架/运行器，或提到 dotnet test/MSTest/xUnit/NUnit/TUnit/VSTest/MTP/覆盖率/test migration 时触发。边界：不用于跨语言 TDD/E2E/API/QA 计划→tech-test-automation；通用失败测试修复流程→tech-test-automation（test-fixing 入口）；构建性能/binlog→dotnet-build；语言无关架构评估→code-quality。"
---

# dotnet-test — .NET 测试编写、分析与迁移

蒸馏自微软 dotnet/skills 仓库 30 个技能（dotnet-test 24 个 + dotnet-test-migration 6 个）。本文件只做路由，执行前必须 `Read` 对应主题文件。

## 触发词路由表（源技能 → 主题文件 → 何时用）

| 源技能 | 主题文件 | 何时用 |
|--------|----------|--------|
| code-testing | `references/test-authoring.md` | 需要改代码的测试工作：生成/补/修/强化测试（Focused 单函数或 Broad 多模块流水线） |
| code-testing-agent | `references/test-authoring.md` | 旧名兼容别名，直接转 `code-testing`，不自我激活 |
| code-testing-extensions | `references/test-authoring.md` | 只读目录（`extensions/dotnet.md` 含 .NET 构建/测试命令与 CS 错误码） |
| writing-mstest-tests | `references/test-authoring.md` | 仅修 MSTest API/配置写法（版本门禁表、断言改写、数据驱动、生命周期） |
| assertion-quality | `references/test-authoring.md` | 把每条断言归入 12 类、套件指标与校准规则 |
| test-tagging | `references/test-authoring.md` | 用固定词表打特征标签（audit 默认，auto-edit/report-only/convention-based） |
| scaffold-dotnet-test-project | `references/test-authoring.md` | 测试工程创建/引用/注册到 .sln/.slnx/.slnf |
| run-tests | `references/test-authoring.md` | 给出/执行正确的 .NET 测试命令（四模式决策表：classic/VSTest/VSTest+MTP 桥/native MTP） |
| platform-detection | `references/test-authoring.md` | 判定工程系统/框架/执行平台（UseVSTest/runner/桥/OutputType 优先级） |
| mtp-hot-reload | `references/test-authoring.md` | MTP 热重载迭代修测试步骤 |
| filter-syntax | `references/test-authoring.md` | 过滤器语法（VSTest/MTP+MSTest/NUnit/TUnit/xUnit v3 各自语法与翻译） |
| coverage-analysis | `references/test-analysis.md` | 解读既有覆盖率报告/Cobertura；有报告绝不重跑测试 |
| crap-score | `references/test-analysis.md` | 点名方法/类的 CRAP 风险（comp≥15 先重构降复杂度） |
| grade-tests | `references/test-analysis.md` | 对策划好的测试清单评 A-F（断言强度/反模式卫生/结构三子维） |
| test-gap-analysis | `references/test-analysis.md` | "测试能抓到这个 bug 吗"——伪变异推理行为盲区（per-test-read-only 组合模式） |
| test-smell-detection | `references/test-analysis.md` | 学术 19-smell 审计（testsmells.org 目录，含正式分类名与校准） |
| test-anti-patterns | `references/test-analysis.md` | 快速实用反模式诊断报告（Critical/High/Medium/Low 排序） |
| test-value-evidence | `references/test-analysis.md` | 针对某次变更/PR/commit 的红绿证据（反事实配对运行） |
| test-analysis-extensions | `references/test-analysis.md` | 只读目录（`disable-model-invocation: true`），为分析技能提供多语言查找表 |
| testability-obstacle | `references/testability.md` | 单点可测性障碍破解（最小缝 + 确定性测试；AsyncLocal 作用域 ambient） |
| detect-static-dependencies | `references/testability.md` | 静态/环境依赖审计（只报告，不改） |
| generate-testability-wrappers | `references/testability.md` | 生成包装器/接入内置抽象（TimeProvider/IFileSystem/IHttpClientFactory/自定义/ambient 缝） |
| migrate-static-to-wrapper | `references/testability.md` | 批量替换静态调用点到用户点名抽象（codemod，含受影响测试） |
| find-untested-sources | `references/testability.md` | 静态源-测试配对（Roslyn/tree-sitter 双引擎，秒级） |
| migrate-mstest-v1v2-to-v3 | `references/framework-migration.md` | MSTest v1（QualityTools 程序集）/v2（NuGet 1.x-2.x）→ v3 |
| migrate-mstest-v3-to-v4 | `references/framework-migration.md` | MSTest v3 → v4（Execute→ExecuteAsync、ExpectedException 移除、TestCase.Id 变化等） |
| migrate-nunit-to-mstest | `references/framework-migration.md` | NUnit 3/4 → MSTest v4（保留 VSTest/MTP；语义映射含 fixture 生命周期/并行/Retry） |
| migrate-xunit-to-mstest | `references/framework-migration.md` | xUnit v2/v3 → MSTest v4（fixture 作用域、并行默认差异、Owner 保留属性） |
| migrate-xunit-to-xunit-v3 | `references/framework-migration.md` | xUnit v2 → xunit.v3（包/属性/伴生包/async void/自定义属性/Type-based 属性/SkippableFact） |
| migrate-vstest-to-mtp | `references/framework-migration.md` | VSTest → Microsoft.Testing.Platform（框架无关，含参数翻译与 CI 迁移） |

## 全局门禁

- **先分类再动手**：任何请求先读工程/中央包文件/`global.json` 判定源版本与当前状态；已是目标状态就报 no-op 并零改动。
- **框架升级保持测试平台不变**（VSTest/MTP 各自保留），runner 迁移不动框架；一次迁移一件事。
- **绝不擅自 commit**；绝不把文档示例版本抄进结果（从配置 feed 解析当前稳定版并全部钉同一版本）。
- **基线与对账**：迁移前记录 discovered/passed/failed/skipped 基线，迁移后同命令同配置对比，每个差异都要调查；绝不静默接受丢测试。
- **分析全程只读**；改代码要显式请求并路由到对应编写技能。
- **边界**：跨语言 TDD/E2E/API/QA 计划 → `tech-test-automation`；通用失败测试修复流程 → `tech-test-automation`（test-fixing 入口）；构建性能/binlog → `dotnet-build`；语言无关架构评估 → `code-quality`。
