# Windows 接入说明

当前源码来自一个已在真实 Windows 账户运行的个人安装。用户已确认开场和透明背景正常。Mac 适配见 `../docs/MAC_HANDOFF.md`。

## 构建

从仓库根目录运行：

```sh
python3 integration/build.py
node --check integration/bundle/runtime.js
```

生成 `bundle/runtime.js` 与 `bundle/media.json`；后者较大，由已提交的本地素材构建，不提交生成结果。

## 当前安装器的边界

安装器使用 PowerShell 7、Node.js 和官方 Store 包，放行 `compatibility.json` 中版本与文件散列均匹配的构建。当前包括 Windows `26.1029.7803.0` 与 `26.1029.9216.0`。

`entrypoints.ps1` 当前从用户桌面 `produce/Codex.lnk` 取得原始官方快捷方式，并保存副本用于恢复。这是原机器的约定；新机器需要先找到实际官方入口并适配，不能直接假定该路径存在。

`install.ps1` 将主题复制到 `%LOCALAPPDATA%/Linker/CodexTheme` 并准备内部快捷方式。**固定到任务栏是独立步骤，脚本不会自动完成。** 原机器已将任务栏固定项替换为此入口，沿用官方名称与图标。开始菜单中的官方注册入口保持原样。

已有原版应用在后台时，启动器会提示完整退出后再打开。Windows 已验证的冷启动修复见 `windows-processes.mjs` 和 `test-startup.mjs`。

## 自动兼容与性能

未知版本会查询本仓库的兼容记录，最多等待 2.5 秒；已匹配的本地记录直接使用。自动获取的是数据，不是可执行脚本。可在安装目录 `config.json` 中设置 `autoCompatibility: false` 关闭网络查询。

`archive-cache.json` 记录已完整校验的应用文件身份；文件路径、大小、修改时间、变更时间或预期散列变化后重新校验。`node launcher.mjs --diagnose --full-check` 可强制完整校验。主题自己的文件每次仍核验完整性。

首屏先传背景和图标，后续素材分批准备；原有两套音声、视频与演出时长保持不变。自动适配的边界和实测数据见 `../docs/UPDATES.md`。

## 恢复

开场「原版 / Original」、主题菜单「恢复原界面」以及 Ctrl + Alt + Shift + L 均可撤回主题。恢复会保存 `enabled=false`，并将本启动器管理的任务栏快捷方式换回保留的官方入口。维护用 `restore.vbs` 保留在安装目录中，不额外放到桌面。

主题样式只改变运行时显示；应用包、登录资料与聊天数据库未被修改。卸载前先恢复，再退出主题启动的应用，最后处理安装目录。

## 验证脚本

- `node integration/test-startup.mjs`：Windows 的零匹配、单进程、多进程解析检查。
- `node integration/test-compatibility.mjs`：兼容记录获取、缓存、离线回退、拒绝错误记录及文件变化后重新校验。
- `node integration/test-launcher.mjs`：独立安装目录中的真实新版启动、校验缓存和停用持久化。
- `node integration/verify-version.mjs <官方可执行文件> <标签>`：真实隔离窗口中完整开场、重播、跳过和恢复；标签含 `english` 时验证英文。
- `node integration/check-shell-surfaces.mjs <本机提取的原生CSS目录>`：背景透明、文字和控件可读性及撤回的独立样式测试。
- `test-install.mjs <官方可执行文件>`：Windows 独立资料窗口中的挂载、播放、撤回测试，会生成本地截图与检查结果。
- `inspect-host.mjs <官方可执行文件>`：Windows 独立资料窗口中的样式与根节点检查。

实机测试脚本含 Windows 进程清理逻辑，不能直接当作 Mac 验证脚本使用。测试资料、浏览器资料、日志、账户状态与机器截图不在公开仓库内。
