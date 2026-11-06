# .NET 测试分析与质量评估

蒸馏自源技能 `coverage-analysis`、`crap-score`、`grade-tests`、`test-gap-analysis`、`test-smell-detection`、`test-anti-patterns`、`test-value-evidence`、`test-analysis-extensions`。覆盖：覆盖率解读、CRAP 风险、清单评分、行为盲区（伪变异）、学术 smell 审计、实用反模式审计、变更红绿证据、多语言扩展目录。不用于：写/修测试代码→`test-authoring.md`；静态依赖与可测性改造→`testability.md`；框架迁移→`framework-migration.md`。

## 0. 分析技能分工（先选对入口）

| 用户问题 | 技能 | 备注 |
|---|---|---|
| 解读既有覆盖率报告/Cobertura | coverage-analysis | 有报告绝不重跑测试 |
| 点名方法/类的 CRAP 风险 | crap-score | "analyze coverage"不触发 CRAP，需明示风险意图 |
| 对策划好的测试清单评 A-F | grade-tests | 无范围先拒绝，不全库自动评分 |
| "测试能抓到这个 bug 吗"/行为盲区 | test-gap-analysis | 伪变异推理，只读默认 |
| 学术/可引用的 smell 审计 | test-smell-detection | testsmells.org 19-smell 分类 |
| 快速实用的测试质量体检 | test-anti-patterns | 严重度排序诊断报告 |
| 针对某次变更/PR 的红绿证据 | test-value-evidence | 必须有已识别的变更 |
| 标签分布/测试组合分类 | test-tagging（见 `test-authoring.md`） | 反模式技能不接 |
| 断言类型多样性指标 | assertion-quality（见 `test-authoring.md`） | |

`test-analysis-extensions` 是**只读目录、不可调用**（`disable-model-invocation: true`）：为上述分析技能提供各语言查找表（测试标记、断言 API、sleep 模式、skip 注解、mystery guest、集成标记、setup/teardown、标签能力分级 `auto-edit`/`report-only`/`convention-based`）。含 `extensions/dotnet.md`（MSTest/xUnit/NUnit/TUnit）、python、typescript、java、go、ruby、rust、swift、kotlin、powershell、cpp。用法：先判定语言/框架，再读对应文件；框架不确定就多读几个；用户点名的框架没有扩展文件时回退最接近的并在报告注明。扩展文件是"如何检测"的数据，不是结论本身。

## 1. coverage-analysis：覆盖率证据解读

- **有既有报告（Cobertura 等）就直接解读，绝不为了"分析"重跑测试**；只有明示需要新数据才收集。
- 条件覆盖 50%（2 分支走了 1）只证明一个结果跑过，不证明另一个。
- 目标覆盖率 T 的达成判定：covered ≥ ceiling(valid × T)；分母只算有效行，排除生成代码。
- 不得称单个未覆盖方法为"全部剩余缺口"，除非逐行对账证明其他行都已覆盖。
- classic（非 SDK）项目：只用仓库自有的覆盖率命令；没有就向用户索要 Cobertura 报告，不擅自注入 coverlet。
- "analyze coverage"类请求**不**自动升级为 CRAP 分析；CRAP 只在用户明示风险/重构意图时触发（转 crap-score）。

## 2. crap-score：CRAP 指数与风险分级

**公式**：`CRAP = comp² × (1 − cov)³ + comp`（comp=圈复杂度，cov=该方法覆盖率 0..1）。

**风险档**：<5 低 / 5–15 中 / 15–30 高 / >30 危急。

**关键规则**：
- comp ≥ 15 时任何覆盖率都救不回（cov_needed = 1 − ((15 − comp)/comp²)^(1/3) 会 ≤0），结论是**先重构降复杂度**，不是补测试。
- **绝不估算/编造覆盖率**：空报告≠0%；报告缺失就报缺失。
- line-rate 与逐行命中数比对偏差超 1% 即视为报告矛盾：停止并报告矛盾。
- 复杂度优先取机器产出：Cobertura 的 `complexity` 属性、`msbuild /t:Metrics`；手工数必须逐项列出依据（if / else if / case / 循环 / catch / `&&` / `||` / `??` / `?.` / 三元 / 模式匹配臂，基线 1）。
- 排除生成代码（`.Designer.cs`、源生成器等）。

**收集命令**（仅在用户明示需要新数据时）：
- VSTest + coverlet：`dotnet test --collect:"XPlat Code Coverage"`
- MTP：`dotnet test --project <p> -- --coverage --coverage-output-format cobertura`（native AOT 用 `--project`）

## 3. grade-tests：策划清单的 A-F 评分

**门禁**：只评用户策划好的测试清单；没有清单先要求范围，绝不自动全库评分。评分全程只读。

**输出**：每测试一个主结果（Pass / Failed / Uncertain / Not applicable）+ A-F 质量分。B 可以 Pass、A 可以 Failed——两者正交。

**三子维**：

| 子维 | 权重 | A | B | C | D | F |
|---|---|---|---|---|---|---|
| 断言强度 | 0.45 | 结构性/多观测断言 | 一条有效断言 | 仅平凡断言 | 自指断言或宽异常 | 无断言/恒真字面量/未 await |
| 反模式卫生 | 0.30 | 见下硬上限 | | | | |
| 结构与聚焦 | 0.25 | AAA、<30 行、单行为 | | 条件逻辑驱动断言或顺序依赖（D）；>60 行、多行为、共享可变状态（F） | | |

**反模式卫生硬上限**（Critical/High 只取最差项封顶，不累加）：无断言→F；吞异常→F；恒真断言→F；自指断言→D；catch 里 `Assert.Fail`→D；注释掉断言→D；`Thread.Sleep`→D；未播种随机/`DateTime.Now`→D；硬编码路径→D；顺序依赖→D；宽异常→C；过度 mock→C；反射测私有→C。**Medium 每项降一级**：烂命名、魔法值、巨型测试、重复断言消息、缺 AAA。**Low 仅注记**。

- 总分 = 0.45×断言 + 0.30×卫生 + 0.25×结构，**封顶于最差子维**。
- 报告给字母+分段（90–100 等），不给精确小数分。
- Failed 必须附最小具体改进行。
- 表 >50 行折叠，Failed 优先展示。
- 需要变异证据时：按名加载 `test-gap-analysis` 的 `per-test-read-only` 模式**一次**，标签只用 **Likely killed (inferred)** / **Candidate survivor (unverified)**，不得自称执行过。

## 4. test-gap-analysis：行为盲区（伪变异推理）

回答一个问题：**哪些调用方可见的生产行为可以在不弄红任何既有测试的情况下改变？** 变异是探针不是目标。

**组合模式**：显式 `per-test-read-only` 请求（含 grade-tests 组合调用）只走 `references/per-test-composition` 语义的按测试评估，**不进入独立工作流**，不授权基线运行/变异执行/编辑文件；参考不可用最多列一次目录后返回 N/A/unverified。

**流程**：
1. **定范围**：单组件/点名风险→盘点高危公开结果；明示验证存活体→每个不同高危结果执行一个代表性候选；明示穷尽审计→加载 mutation-catalog 全分类；建新套件→停，转 `code-testing`。点名风险先写成一行公开结果白名单（如 money math：金额/费率/档位/取整在范围，非金额状态谓词不在）。
2. **一条基线**：源审读可跳过执行并标 unverified；需要执行时跑最窄既有测试命令一次，exit 0 但只有构建输出不算绿。一次跑不起来就不再折腾 runner，转静态并全标 unverified。基线缺失只限制"经验存活"声明，不使源证明事实变 tentative：无测试触达的结果仍是 **No coverage**。
3. **盘点公开结果**：`public input/sequence -> expected outcome -> existing assertion -> gap`。一个断言的返回字段不覆盖另一个；允许不覆盖拒绝；null 不覆盖 empty/whitespace。守卫边界用 `limit-1 / limit / limit+1` 三点。授权类枚举每个身份×资源×动作，denial 是一等缺口。>5 个未断言高危行为时只执行 top 3–5，其余保持 No coverage/Candidate survivor (unverified)。
4. **只收可观测候选**：先把变异重放到每个既有断言输入上——任何公开观测变化即 **Likely killed**（无需专测）。排除：需要插入/重排语句的编辑、不编译的编辑、未确立契约的语义（溢出、异常消息/ParamName）、落回同结果的守卫删除、纯私有表示变化、对偶输入下原/变体同值的边界编辑（`<` 改 `<=` 两分支都返回 floor）、平凡一行包装器、生成代码/日志/格式化。
5. **分级判定**：**Strong**（核心分支与主边界受保护，仅剩少量校验变体——先说强项再列小缺口）/ **Mixed**（有意义覆盖但至少一个重要分区无保护）/ **Weak**。结果标签：Likely killed / Candidate survivor (unverified) / Killed / Survived / No coverage / Equivalent（从发现中省略）。
6. **验证纪律**（仅明示验证/审计/补测时）：一次一个候选，diff 只改一个表达式；跑最窄覆盖测试；绿=Survived、相关断言失败=Killed（仅限该编辑）；构建/发现/基础设施失败=unverified 不是 Killed；**立即还原**并确认干净基线；绿跑后重查公开反事实——执行证明套件漏掉了编辑，不证明编辑改变行为。绝不留变异在工作区。
7. **补测仅在请求时**：只为执行过的 Survived 或证实的 No coverage 补测；先建 survivor→test 清单，结束时双向映射；优先一个行为测试杀多个相关变异；补测后重新施加原变异证明新测试能杀，再还原源码干净跑窄套件。仓库有规范变异校验器就跑它并引用结果，手造替代变异不算。

**输出**：小范围=一行判定+（Strong 时）强项句+每可行动结果一行表 `Risk | Public outcome | Change | Result/evidence | Smallest test`，每缺口给区分见证与具体最小测试；穷尽审计分开执行计数（Killed/Survived）与静态计数，静态推理绝不混入经验 killed/total 比。

## 5. test-smell-detection：学术 19-smell 审计

用于要求**正式/可引用分类名**的审计（testsmells.org 目录）；快速实用体检走 test-anti-patterns。只审暂存或点名的测试；先搜工作区再谈缺文件；完整目录只在用户要全部 19 项/要引用/疑似高信号集外的 smell 时加载。

**高信号判定**（证据→正式名→做/不做）：

| 证据 | 判定 | Do | Never |
|---|---|---|---|
| 断言行为被 `if`/`switch`/分支循环改变 | Conditional Test Logic | 拆分或参数化 | 仅因 runner 循环就flag表驱动/参数化测试 |
| 依赖未声明的文件/网络/环境/DB | Mystery Guest / Resource Optimism | 显式化、hermetic 化 | 仅因集成测试碰了声明的真实资源就判 |
| 固定墙钟 sleep 等结果 | Sleepy Test | 改为轮询条件+超时 | 因是集成测试就降级 |
| 可执行测试无断言/期望异常/mock verify | Unknown Test | 断言可观测量 | 空体叫 Unknown Test（正式名 Empty Test） |
| 异步断言创建但未 await/return | **非目录 Critical 假通过缺陷** | 单独报告并给出所需 await | 硬塞进 Unknown Test |
| 一个测试碰多个无关行为 | Eager Test | 按行为拆分 | 不经范围考量就判有意的 E2E 流程 |
| 期望数字字面量无本地含义 | Magic Number Test | 命名领域值或从 setup 推导 | 加三项后 `count == 3` 就flag |
| 断言依赖 ToString/repr 非契约格式 | Sensitive Equality | 断言稳定字段或结构匹配器 | 契约本身就是格式化字符串时flag |
| 手工管理异常流 | Exception Handling | 用框架异常断言并查有意义细节 | 说捕获-断言测试什么都没验证 |
| 共享 setup 产生无关状态 | General Fixture | 删无关状态/收窄 | 相关共享 setup 仅因共享就判 |
| 测试被禁用/跳过 | Ignored Test | 全部报告；有理由的跟踪跳过排在无理由之下 | 理由好就清除条目 |

**校准**：mock verify、快照、裸 pytest assert、Pester `Should -Invoke`、期望异常构造都是断言；一条断言永不是 Assertion Roulette；同方法测试覆盖不同边界不是 Lazy Test；General Fixture 需共享生命周期状态；本地临时文件仍形式符合 Mystery Guest（hermetic 只降严重度不改分类）；Catch2 `SECTION`/`GENERATE`/`REQUIRE` 是 runner 展开+真断言，仅这些可疑构造时判定 **clean**；无实质 smell 就明说，绝不为凑报告造发现；对 void API 绝不建议 `await`。

**严重度按实证风险**：High=可在行为损坏时静默通过/非确定性/隐藏未执行断言路径；Medium=失败含糊或耦合不稳定细节；Low=维护债。每个 smell 必须有正式名+精确位置+代码证据+实际风险+框架正确的修复；非目录有效性缺陷排在学术判定之后，clean 输入无生产契约时不给可选覆盖观察赋严重度。

## 6. test-anti-patterns：实用反模式诊断报告

任何语言的快速体检，产出按严重度排序的诊断报告（只诊断；直接改代码转 writing-mstest-tests / code-testing）。

**流程**：解析路径（工作区发现，技能目录不是工作区）→ 清点范围（每个测试方法和类级 fixture 一行台账：oracle/异常处理/状态时间依赖/并发/前置顺序/处置）→ 按目录扫描 → 诚实校准严重度 → 报告 → 排序建议。

**目录**（Critical=假信心；High=会痛；Medium=可维护性；Low=卫生）：
- **Critical**：无断言（mock verify 算断言）；异步断言未 await（静默通过）；**coverage touching**（系统性逐成员调用整个门面而无真实断言，区别于单个无断言测试）；自指断言（`AreEqual(result, result)`；但有效的 identity/clone/序列化往返契约不算——检查输入是否触发变换、是否缺独立表示断言）；吞异常；只在 catch 里 Assert.Fail；恒真断言；注释掉的断言。
- **High**：flakiness 指标（墙钟 sleep、裸 DateTime.Now/Date.now、未播种随机、硬编码环境路径）；测试顺序依赖（跨测试修改静态/全局、setup 不复位）；过度 mock（setup 多于逻辑、验证精确调用序列；.NET 深审转 exp-mock-usage-analysis）；实现耦合（反射测私有、断言内部状态）；宽异常断言；**弱变换 oracle**（输入已是期望形态，no-op 实现照样通过——用必须变化的输入+独立推导的期望值）。
- **Medium**：烂命名（Test1）；魔法值；重复测试（3+ 个仅一个输入不同的近同体→参数化；**不同边界各一个测试不是重复**；.NET 深审转 exp-test-maintainability）；巨型测试（>~30 行/多行为）；重复断言消息；缺 AAA 分隔。
- **Low**：空转 setup/teardown；未管理资源；print 调试残留；命名风格不一致。

**校准**：共享可变状态一般是 High，用户报告了真实顺序失败或代码证明依赖才是 Critical；未 await 是 Critical；系统级发现与实例分开计数（`1 finding / 6 affected tests`）；相邻未测分支列在 **Adjacent coverage gaps**，不混入反模式计数（穷尽分支盲区转 test-gap-analysis）；Go/Rust 表驱动循环、pytest 裸 assert、Go `if got != want` 都是惯用法不flag；测试写得好就开头明说——"0 Critical, 0 High, 1 Low"是合法结论，绝不膨胀严重度。
**深度门槛**：点名每个范围内测试（报审查数）；判定 oracle 前先读生产契约，绝不虚构字段；每个 Critical/High 修复给**精确期望值**（不是 `// assert something`）；汇总计数与列举发现一致；不发现要果断（点名可疑构造和使其合法的框架规则）。

## 7. test-value-evidence：变更绑定的红绿证据

**前提**：必须有已识别的变更（PR/commit/未提交 diff）；没有就报告缺范围，不评整个工作区。通用盲区转 test-gap-analysis，逐测试评分转 grade-tests，变异战役用仓库现有工具。

1. **绑定修订**：PR 记 merge base+head SHA；commit 记父+commit（合并提交显式定父）；未提交记 base SHA+可复现补丁身份（含相关未跟踪文件）。相关源/测试/配置/包变更后证据过期，除非重新验证。每个行为变更映射 `requirement -> input/sequence -> expected public outcome -> 生产入口 -> 点名测试/数据用例 -> 区分断言`；期望结果**独立于实现和测试当前值**推导。变更组件的 mock、自比较、由被测算法算出的期望值都不是独立 oracle。
2. **选反事实**：

| 变更类型 | 反事实 | 必需观测 |
|---|---|---|
| Bug 修复 | 保留回归测试，还原真实修复前缺陷 | 对该缺陷红，修复后绿 |
| 新功能 | 禁用/破坏行为但保留 API 形状与可编译 setup | 断言检出缺失/错误行为，功能在时绿 |
| 强化的测试 | 引入一个合理错误公开结果 | 强化测试检出；未改产品通过 |
| 行为保持重构 | 比较前后契约；可选探测相关故障 | 保持测试两个修订都过（修复前绿是预期） |
| 纯文档/生成元数据 | 确认是否有可执行契约改变 | 只有具体理由才 Not applicable |

   修复优先"真实修复前实现+同一回归测试"；编译不过就只在 head 版还原缺陷行为——这叫**定向反事实**，不是基线修订运行，记录其补丁/hash。功能缺失符号的编译错误不是行为证明；编译器/分析器诊断只有被执行 harness 断言该诊断本身才算行为。优先小而合理的故障（还原旧边界、丢输出、跳回调、忽略选项、返回错值）；等价变异不是缺口；崩溃/超时/异常只有是契约信号且诊断归因于故障才算。
3. **成对运行仅在授权时**：实现类任务通常需要执行；只读评审=检查，评审请求本身不授权改源码或跑构建。执行环境：自有隔离检出，保留用户脏文件；最小相关选择在正确实现上跑，确认点名测试真执行且过；隔离实验里只施加选定缺陷行为，重建重跑同一选择，捕获具名失败/期望实际/退出码/诊断；恢复正确实现重跑确认绿；验证受保护文件字节。不得复用陈旧构建/缓存，不依赖 `--no-build` 或 runner 退出码；记录每次 selected/executed/passed/failed/skipped，runner 不暴露就写 unknown。跨组件行为先定 producer-consumer 契约（所有权/生命周期/握手/退出语义/回退/兼容/取消/多模块聚合），记录确切交付二进制与发布分支，重建打包、隔离有效包缓存、证明真实消费者加载了哪个变体——unit mock 或源码兼容编译不替代交付布局验证。只读模式全程静态，结论标 **static predictions**，绝不写成执行证明；CI 绿或作者声称不是红绿证据。
4. **报告**：紧凑 **Test-value evidence** 节，一行一个变更契约：`Contract/test case | Counterfactual | Without behavior | Correct implementation | Evidence/gap`。标签只用：executed: detected / executed: survived / static: predicts detection / static: predicts survival / unverified / equivalent / not applicable。静态预测绝不与实测变异计数/分数合并。最终 PR head 的证据不证明每个中间 commit。

## 8. 通用输出纪律（全部分析技能）

- 报告规模匹配输入：小套件给结论+一张每测试表，不灌仪表盘；不叙述发现/加载过程。
- 只报告实际执行的动作；未跑/失败的命令绝不说成成功；构建/发现/基础设施失败≠测试失败。
- 每个发现要有位置、代码证据、风险和具体修复；clean 就明说 clean。
- 分析全程只读；改代码要显式请求并路由到对应编写技能。
