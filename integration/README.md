# Windows 接入说明

v0.7.0 修复主题与原版启动丢失 Windows 程序包身份的问题，并更新常规版本兼容机制。原有视觉、双语开场与角色动画保持一致。应用包、登录资料和聊天数据库不由主题安装器改写。实际验证版本和范围见 [更新记录](../docs/UPDATES.md)。

## 安装

需要 Windows x64、Node.js 22+、系统自带的 Windows PowerShell 与 .NET Framework 4.x，以及官方 Codex Store 包。安装发行版无需 Python、编译器或签名私钥。

在仓库根目录运行：

```powershell
$release = node integration/fetch-release.mjs | ConvertFrom-Json
& integration/install.ps1 -Bundle $release.bundle
```

下载程序只接受本仓库 Windows 频道、固定公钥验证通过的发行版。安装目录为 `%LOCALAPPDATA%\Linker\CodexTheme`；已有安装先完整备份到相邻 `Linker\Backups`。保留语言、声音和启用状态。

原机器已有的任务栏固定项仍指向同一个 `launch.vbs`，安装后直接复用，不增加日常入口。`entrypoints.ps1` 首次准备入口时仍从桌面 `produce/Codex.lnk` 取得官方快捷方式；新机器需先核对这一约定。安装器只准备内部快捷方式，不自动固定到任务栏。开始菜单中的官方注册入口保持原样。

官方图标提取到本地固定路径，已有受管理的任务栏项仅刷新图标位置与应用标识，避免 Store 清理旧版本目录后失去图标；修改前保存该固定项的副本。

应用已经运行时，点击入口会聚焦现有窗口；完整退出应用后，下一次从任务栏打开才播放新开场。安装本身不关闭当前应用。

从旧版迁移到 v0.7.0，需要先更新此仓库并执行上面的安装命令一次，更新固定加载器与救援副本的回退底线。旧运行时可在线获取新主题，但完整迁移还要防止入口回退后复活旧的无包身份启动方式。迁移后，包环境启动、单实例控制和异常恢复代码均包含在签名发行包中，随后随自动更新启用。公钥轮换或固定信任协议变更仍需显式安装。

## 日常启动

1. 独立窗口立即显示连接状态。
2. 已验证过的应用与主题组合直接启动。后台获取新发行版，完成签名、散列校验后暂存，下一次启动再验证启用。
3. 首次遇到新的官方版本，或有待启用主题包时，在等待窗口里完成下载与本机兼容验证。
4. 通过后播放原有开场、进入对话。失败时使用仍兼容的旧主题；旧主题也不兼容则打开原版。

两条启动分支都经 Windows 的程序包环境启动官方应用，校验实际子进程身份。主题通过匿名管道及随机命名管道连接，不开放调试 TCP 端口。每次启动重新解析已注册包；如果 Store 在检查与启动之间切换版本，会重新发现并重试一次。主题不接管官方更新检查或隐藏原生更新控件。

`config.json` 可设置 `autoUpdate: false` 关闭在线主题更新。历史设置 `autoCompatibility: false` 也视为关闭在线查询。断网时仍可使用已安装的兼容主题，或在本机验证新的官方版本。

## 恢复与诊断

等待窗口的「本次使用原版 / Original」只跳过本次主题，可按 Esc 使用；不会永久关闭主题。

开场「原版 / Original」、主题菜单「恢复原界面」及 Ctrl + Alt + Shift + L 会保存 `enabled=false`，并把本启动器管理的任务栏快捷方式恢复为官方入口。维护用 `restore.vbs` 留在安装目录，不额外放到桌面。

在安装目录运行：

```powershell
node bootstrap.mjs --diagnose
node bootstrap.mjs --update-only
node bootstrap.mjs --update-only --force-probe
node bootstrap.mjs --restore
```

`--diagnose` 报告实际包版本、主题版本、启动逻辑版本、签名和本机兼容缓存；`--update-only` 获取更新并验证，不启动正式账户窗口，验证失败返回 `updated:false` 与非零退出码；`--force-probe` 强制重新验证。已有主题启动器运行时，`--update-only` 返回 deferred，不与正在启动的实例竞争。`bootstrap.log` 记录单实例取得、重复激活、回退和入口异常；`launcher.log` 记录开机时间、官方版本及挂载结果。测试窗口使用独立资料目录。详见 [更新实现](../docs/UPDATES.md)。

## 开发与发布

```powershell
python integration/build.py
& integration/build-progress.ps1
node integration/build-release.mjs 0.7.0
```

发布构建需要维护者本机签名密钥，保存在 `%LOCALAPPDATA%\Linker\ReleaseSigning`，不进入仓库或发行资产。已有公钥不匹配时构建停止；普通安装只需公钥。发布后的版本号及其签名内容不可复用或改写。

把 `integration/dist/<version>/` 中的压缩运行时、压缩素材和 `linker-windows-release.json` 上传到 `win-v<version>` 的 GitHub Release。只有正式 Windows 标签参与自动更新；Mac 标签与预发布不参与。升级稳定入口协议或轮换公钥需单独安装，固定信任加载器和公钥不通过运行时更新替换；`boot-entry.mjs` 和 `instance-lock.mjs` 是可更新的签名启动逻辑。签名救援副本 `bootstrap-core/` 让旧运行时回退时仍使用新的单实例机制。

## 验证脚本

- `node integration/test-intro-reload.mjs`：真实页面重载后的进度、语音、视频续播，以及结束、跳过、恢复后重载。`--english` 验证英文，`--rapid` 增加连续重载；`--baseline` 仅用于对照仍保留在本机的 v0.5.1。
- `node integration/test-media-delivery.mjs`：旧文档的素材失败回调不会终止新文档开场。
- `node integration/test-shell-capabilities.mjs`：类名和样式变化继续接受，关键语义职责消失则拒绝；核对官方更新器日志分类。
- `node integration/test-manager-fallback.mjs`：模拟未来关键界面能力消失，确认实际原版回退保留包身份；仅检查模式失败时返回明确结果，不意外打开应用。
- `node integration/test-packaged-session.mjs --authenticated`：独立资料使用本机已有登录凭证验证官方更新器、全屏背景和撤回；结束后移除复制的凭证。加 `--original` 验证无调试连接的原版分支；已是最新版时加 `--manual-check`，在测试窗口的官方菜单选择“检查更新”，因后台无更新路径可以不写发现日志。有更新时加 `--expect-update` 核对原生进度控件可见。不会发送聊天。

- `node integration/test-release-store.mjs`：签名、分阶段安装、下载中断、文件篡改、素材复用及结构变化拒绝。
- `node integration/test-bootstrap.mjs`：Windows 实际命名管道互斥、八次并发启动、强制结束、活进程号复用、跨重启残留状态、签名启动逻辑更新与篡改回退。
- `node integration/test-cold-start.mjs`：官方应用独立资料的真实启动，进程树强制结束后重复恢复、重复点击与完整撤回。上述测试不等同于重启整台电脑。
- `node integration/test-launcher.mjs`：真实独立资料窗口中的首次兼容验证、缓存启动、语言保留与恢复持久化。
- `node integration/test-cancel-probe.mjs`：取消本机验证后，仅结束自己的测试进程，不保存通过记录。
- `node integration/test-online-update.mjs`：从 GitHub 真实下载、验签、启用并启动。默认从本机 v0.6.0 测试包升级到已发布的 v0.7.0；`--baseline` 和 `--target` 可指定后续验证版本。`--background` 要求基线本身兼容当前官方应用，用于验证后台暂存和下次冷启动启用。
- `node integration/test-startup.mjs`：Windows 零匹配、单进程、多进程解析。
- `node integration/verify-version.mjs <官方可执行文件> <标签>`：完整开场、重播、跳过及恢复；标签含 `english` 时验证英文。
- `node integration/check-shell-surfaces.mjs <本机原生CSS目录>`：背景透明、控件可读性及样式撤回。

`test-compatibility.mjs` 与 `compatibility.json` 保留为旧 v2 启动器的数据查询回归，不是 v0.5.0 的更新入口。所有实机测试资料、日志、提取的应用代码和截图仅保存在本地。
