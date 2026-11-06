# 本地 .NET SDK 安装（源：setup-local-sdk）

把 SDK 装进项目本地 `.dotnet/`，用 `global.json` 的 `paths` 特性（.NET 10+）接线：不动系统全局安装、工程根目录 `dotnet` 命令自动采用、删 `.dotnet/` 即还原。适用：安全试用预览版、钉特定版本、可复现的团队/CI 安装。不适用：系统级安装（走官方安装器）、宿主 dotnet < v10（无 `paths`，解释后停止）、仅装运行时（`paths` 只管 SDK 解析）。

## 前置

- 全局已装 .NET 10+ SDK：`dotnet --version` 主版本 ≥ 10。用户已给出的版本输出即其机器权威版本（与工作区不同则说明差异并按用户机器继续）。
- curl（macOS/Linux）或 PowerShell（Windows）。

## 工作流

1. **明确装什么**：未指定就问版本（如 "latest .NET 11 preview" 或精确 `11.0.100-preview.2.26159.112`），映射到 `--channel`/`--quality`（daily|preview|ga）或 `--version`。
2. **验证宿主 ≥ v10**，否则停止并说明。
3. **检测 OS**：`uname -s` 成功（含 MINGW/MSYS/CYGWIN=Git Bash）→ bash + `dotnet-install.sh`；失败 → PowerShell + `dotnet-install.ps1`。
4. **查已有 `.dotnet/`**（`test -d .dotnet` / `Test-Path .\.dotnet`）：存在则问——更新版本还是保留跳过。
5. **下载并运行官方安装脚本**（`https://dot.net/v1/dotnet-install.sh|.ps1`，装到临时文件用完即删）：

```bash
curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$INSTALL_SCRIPT"
bash "$INSTALL_SCRIPT" --channel <CHANNEL> --quality <QUALITY> --install-dir .dotnet
# 精确版本改 --version <VERSION>
```
```powershell
Invoke-WebRequest -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installScript
& $installScript -Channel <CHANNEL> -Quality <QUALITY> -InstallDir .dotnet
```

6. **记录精确版本**：`./.dotnet/dotnet --version`（Windows：`.\.dotnet\dotnet.exe --version`）。
7. **创建/更新 global.json**：

```json
{
  "sdk": {
    "version": "<INSTALLED_VERSION>",
    "allowPrerelease": true,
    "rollForward": "latestFeature",
    "paths": [".dotnet", "$host$"],
    "errorMessage": "Required .NET SDK not found. Run ./install-dotnet.sh (or .ps1) to install it locally."
  }
}
```
- `paths`：本地优先、`$host$` 系统兜底；仅需路径不需钉版本时可最小化 `{"sdk":{"paths":[".dotnet","$host$"]}}`。
- 浮动最新预览 → `rollForward: "latestFeature"`；精确版本请求 → `rollForward: "disable"`（防解析漂移到别的 feature band）。
- `allowPrerelease: true` 仅预览版；`errorMessage` 仅配套团队脚本时加。
- 已有 global.json 必须**合并**：先读、只增改 `sdk` 节、保留 `msbuild-sdks`/`tools` 等，改前备份 `global.json.bak`。
8. **更新 .gitignore**：追加 `.dotnet/`（已存在则跳过）。
9. **装工作负载**（如用户提到 MAUI/移动/Blazor WASM）——在 global.json 与 .gitignore 完成后做，且**必须用本地二进制**（工作负载元数据按宿主 dotnet 根存放，系统 dotnet 会写错位置，dotnet/sdk#49825）：`./.dotnet/dotnet workload install <workload>`，`workload list` 验证。Linux 无完整 `maui` 元负载：按目标平台选 `maui-android` 等或说明限制并询问。
10. **团队脚本**（用户提"团队/共享/CI/脚本"时创建，否则主动提议）：`install-dotnet.sh` + `install-dotnet.ps1` 提交入库。脚本要点：变量对应第 1 步选择（精确版本→`--version`+`rollForward:disable`；channel→channel/quality+预览才 `allowPrerelease:true`）；备份并用 jq/ConvertFrom-Json **合并** global.json（bash 无 jq 时拒绝覆盖、打印待手工合并的 sdk 节并退出非零）；写 .gitignore；末尾按参数装工作负载。若 global.json 已钉版本且用户主要要脚本→复用该版本，不为发现版本而长跑 SDK 下载；同时要配置和脚本→先建脚本/配置再跑慢安装。
11. **验证解析**：工程根 `dotnet --version` 应等于本地安装版本；不符查 global.json 位置、`paths` 内容、宿主 ≥10。
12. **总结**：报告 SDK 版本、global.json 最终 `sdk` 值（或片段）、.gitignore 已加、系统安装未动；清理方法（删 `.dotnet/`、移除 paths/errorMessage、可选删脚本）；装过工作负载则附所用命令与验证结果或精确阻塞点。

## 坑速查

| 症状 | 原因 | 修复 |
|---|---|---|
| `paths` 被忽略 | 宿主 dotnet < v10 | 系统先装 .NET 10+ |
| 解析到错误 SDK | 父目录有 global.json | 向上检查 |
| 队友报 "SDK not found" | `.dotnet/` 已 gitignore 且没跑安装脚本 | global.json 加 `errorMessage` |
| 工作负载缺失 | 用了系统 dotnet 装 | 用 `./.dotnet/dotnet workload install` |
| `dotnet app.dll` 选错运行时 | `paths` 只管 SDK 不管 apphost | 用 `dotnet run` 或设 `DOTNET_ROOT` |
