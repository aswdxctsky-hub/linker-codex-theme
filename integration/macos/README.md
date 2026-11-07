# macOS 启动器

本地测试版 0.1.0。已验证 Apple Silicon 上的 ChatGPT `26.1103.32239`（build `25471`）；兼容记录的 `isolated-native` 表示在真实应用的独立、未登录资料目录中通过测试。正式账户、原生全屏和 Dock 入口仍待验收，详见 [当前验证状态](../../docs/MAC_STATUS.md)。

启动器通过私有 stdio 调试管道挂载主题，不改官方 `.app`、签名、账户目录或登录项，不打开 TCP 调试端口。启动中的正式应用会保留，启动器提示先用 ⌘Q 退出。Mac 使用单独的版本、构建号、架构与 ASAR 散列记录，加载前校验官方签名和主题文件；未知构建打开原版。Mac 当前不从网络自动获取兼容记录。

## 构建

系统 Python 3.9+ 足够。当前应用随附 Node.js 24，可直接使用，无需 Homebrew 或全局 npm 依赖：

```sh
python3 concept-v4/build.py
python3 integration/macos/build.py
theme_node="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
"$theme_node" --check integration/bundle/runtime.js
"$theme_node" --test integration/macos/test.mjs
"$theme_node" integration/macos/launcher.mjs --diagnose --full-check
python3 integration/macos/package.py --dmg
```

输出在 `release/ChatGPT 主题.app` 和 `release/ChatGPT-主题-macOS-0.1.0.dmg`。打包器只给新建的启动器作本机 ad-hoc 签名，未改动或重新签署官方应用。启动器使用官方应用随附的 Node；更新后如果该运行时不可用，会打开官方应用。这个包不是经过 Developer ID 公证的通用发行版。

## 使用与恢复

1. 用 ⌘Q 完整退出 ChatGPT，再双击「ChatGPT 主题.app」。正式启动不设置 `CODEX_HOME` 或 `--user-data-dir`，使用官方应用本来的账户。
2. 开场点击「原版」，或从右下角主题菜单选择「恢复原界面」；紧急键为 **⌘⌥⇧L**。
3. 恢复会立即撤回样式和开场，并保存 `enabled=false`。之后通过主题启动器再打开也会进入原版。

维护命令（在仓库根目录执行）：

```sh
theme_node="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
"$theme_node" integration/macos/launcher.mjs --restore
# 明确重新启用；如正式应用仍在运行，会提示完整退出
"$theme_node" integration/macos/launcher.mjs --enable
```

主题配置、文件校验缓存和简短诊断日志在 `~/Library/Application Support/Linker/CodexTheme/`。启动器不会读写原生聊天数据库。恢复后退出应用，移走主题启动器即可停止使用；无需清空官方资料。

## 入口边界

主题启动器有独立 bundle ID，使用官方图标，但不冒充官方应用的身份。它未替换已有 Dock 图标，也未安装常驻监听或登录项；直接点击官方图标仍按原方式启动。`LSUIElement` 只让启动器自身不作为普通前台窗口运行，不代表已验证 Dock 同图标合并。后续应在用户确认后验证实际 Dock 行为，不使用重复 bundle ID、改官方签名或改 Dock 数据来伪造兼容。

## 验证

```sh
theme_node="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
"$theme_node" integration/macos/verify.mjs
"$theme_node" integration/macos/test-launcher.mjs
```

`verify.mjs` 验证完整中英流程、音频解码、视频实际推进、重播、跳过、按钮恢复与 Retina 视口变化；`test-launcher.mjs` 验证真实启动器的冷启动、重复打开、已有正式进程、页面重载、设置持久化及停用后重启。两者只终止各自创建的精确子进程，保留失败记录和隔离资料到被 Git 忽略的 `integration/verification/`。

原生 Electron 窗口不支持 Chromium 的 `Browser.getWindowForTarget`，Owl 也不支持 `Target.createTarget`。脚本中的视口变化不是原生全屏测试；离线预览与原生 CSS 测试页在单独浏览器中验证。不要把测试页结果当作正式账户聊天验收。

更新兼容记录前，先运行候选版本隔离验证并审阅截图，再写入该版本的真实散列。不得仅更新版本号或重新计算散列后自动放行。
