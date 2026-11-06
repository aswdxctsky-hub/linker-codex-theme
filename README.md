# Linker · ChatGPT / Codex Theme

瓷白与冰蓝的科幻启动仪式，配合白龙娘问候、双语机械音声和贯穿对话窗口的透明背景。

**Windows 已在用户的真实账户上运行；`26.1029.9216.0` 更新适配已通过隔离实机测试。macOS 尚未适配，接手请先读 [MAC_HANDOFF.md](docs/MAC_HANDOFF.md)。**

## 当前效果

连接 → 模拟虹膜识别 → 身份确认 → 八路权限加载 → 会话建立 → 信号扩散与角色显现 → 鞠躬问候 → 原生对话界面。

- 中文为主、英文为辅；中英两套音声可切换。
- 开场提供跳过、静音与低调的「原版 / Original」恢复按钮。
- 对话区使用连续背景；侧栏保持轻薄底色，输入框、代码与菜单保留可读性。
- 保留原生聊天、项目、侧栏和编辑器；认证与权限文字只是开场演出，不调用摄像头、不授予真实权限。
- 当前示例素材以 **Skyler** 为问候对象，姓名已包含在预录音声与角色口型中。

## 构建和预览

需要 Python 3.10+；启动器和检查脚本使用 Node.js 22+。使用现成素材构建不需要 API Key、付费服务或 npm 依赖。

```sh
python3 concept-v4/build.py
python3 integration/build.py
node --check integration/bundle/runtime.js
```

生成的 `concept-v4/preview.html` 可离线打开。也可启动仅限本机的预览服务：

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory concept-v4
```

访问 `http://127.0.0.1:8767/preview.html`。独立预览末尾的聊天是演示；实际安装使用原生应用界面。

## 代码位置

| 路径 | 用途 |
| --- | --- |
| `concept-v4/app.js` | 已确认的流程、绘制、音声和角色转场 |
| `concept-v4/assets/`、`audio/` | 构建所需的本地图像、视频及双语音声 |
| `concept-v4/preview.template.html` | 独立预览外壳 |
| `integration/runtime.template.js` | 注入真实应用的主题、开场与恢复控制 |
| `integration/shell-surfaces.css` | 对话主面板透明和侧栏底色修正 |
| `integration/build.py` | 生成 `bundle/runtime.js` 与 `bundle/media.json` |
| `integration/pipe-client.mjs` | 私有调试管道协议客户端 |
| `integration/launcher.mjs` | 当前 Windows 启动器、版本校验、配置保存与恢复 |
| `integration/install.ps1`、`entrypoints.ps1` | 当前 Windows 安装及任务栏入口处理 |
| `docs/MAC_HANDOFF.md` | Mac 实机接续所需的已知事实、边界和验收目标 |

## Windows 状态

当前兼容 `OpenAI.Codex 26.1029.7803.0` 和 `26.1029.9216.0`，应用内名称可能显示为 ChatGPT。旧版已获用户确认，新版已验证中英完整开场、重播、跳过、恢复、启动器挂载和原生背景样式。安装包未修改，启动时由外部启动器通过私有管道挂载主题。

启动器会自动获取本仓库已经验证的兼容记录。未知版本、文件校验不符或取不到记录时打开原版；不会自动改版本号放行。应用文件未变化时复用校验结果，开场首屏先加载约 1.95 MB 图像，视频与音声随后传入。详情见 [更新与启动速度](docs/UPDATES.md)。

这是一份已运行的个人项目源码，Windows 安装脚本仍有原机器的入口约定，**不是适用于任意电脑的一键安装器**。具体依赖见 [Windows 说明](integration/README.md)。不要只替换版本号或散列值来绕过兼容检查。

## 素材与署名

登录流程参考 `LeeRolling/dsh-boot-suite`；白龙娘原设参考 ZipZipPipe；图标属于 OpenAI。完整来源及第三方许可见 [来源与署名](concept-v4/THIRD-PARTY-NOTICES.md)。仓库包含本项目生成或处理的素材，不包含原作者的参考原图、官方应用包或第三方仓库的角色素材。

本项目为个人定制，不代表 OpenAI 官方功能。公开仓库不改变原角色、图标等第三方内容的权利归属；目前未给整个仓库附加统一开源许可证。
