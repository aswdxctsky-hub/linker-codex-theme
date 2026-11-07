# Linker · ChatGPT / Codex Theme

瓷白与冰蓝的科幻启动仪式，配合白龙娘问候、双语机械音声和贯穿对话窗口的透明背景。

**Windows v0.5.1 已适配 `OpenAI.Codex 26.1103.3517.0`，支持签名更新包、首次遇到新版时的本机兼容验证，以及独立的启动等待窗口。** macOS 由 [macos-adaptation 分支](https://github.com/aswdxctsky-hub/linker-codex-theme/tree/macos-adaptation) 单独接续，本轮没有改动或验证 Mac 实现。

## 当前效果

连接 → 模拟虹膜识别 → 身份确认 → 八路权限加载 → 会话建立 → 信号扩散与角色显现 → 鞠躬问候 → 原生对话界面。

- 中文为主、英文为辅；中英两套音声可切换。
- 开场提供跳过、静音与低调的「原版 / Original」恢复按钮。
- 对话区使用连续背景；侧栏保持轻薄底色，输入框、代码与菜单保留可读性。
- 保留原生聊天、项目、侧栏和编辑器；认证与权限文字只是开场演出，不调用摄像头、不授予真实权限。
- 当前示例素材以 **Skyler** 为问候对象，姓名已包含在预录音声与角色口型中。

## 启动与更新

已有可用版本时直接启动，后台查询并下载新的签名主题包，下一次冷启动验证后启用。官方应用版本变化，或已有新主题包待启用时，独立等待窗口先完成必要的下载、校验与本机测试，再衔接开场。下载显示实际字节进度；检查和验证显示扫描线。

未知 Codex 版本先比对主题依赖的界面规则，再在独立资料目录实际挂载、撤回，通过才缓存结果。布局变化或测试失败时进入原版，等待维护者发布适配。主题更新使用固定公钥验证签名，保留上一版用于回退。

这些操作更新的是**主题程序**。Codex 本体继续由其官方安装渠道更新。详细流程、边界与测量见 [更新与启动速度](docs/UPDATES.md)。

## 安装和预览

这是个人定制源码，Windows 入口准备仍有原机器的路径约定；不是任意电脑的一键安装器。已有安装可沿用原有任务栏图标，不额外创建快捷方式。安装、恢复与诊断见 [Windows 说明](integration/README.md)。

独立预览需要 Python 3.10+，无需 API Key、付费服务或 npm 依赖：

```sh
python3 concept-v4/build.py
python3 -m http.server 8767 --bind 127.0.0.1 --directory concept-v4
```

访问 `http://127.0.0.1:8767/preview.html`。预览末尾的聊天是演示；实际安装使用原生应用界面。

## 代码位置

| 路径 | 用途 |
| --- | --- |
| `concept-v4/app.js`、`assets/`、`audio/` | 已确认的流程、图像、视频与双语音声 |
| `integration/runtime.template.js`、`shell-surfaces.css` | 原生应用内的开场、背景与恢复控制 |
| `integration/bootstrap.mjs` | 稳定入口、签名验证、版本选择与中断回退 |
| `integration/manager.mjs`、`release-store.mjs` | 更新下载、版本目录与启用流程 |
| `integration/auto-compatibility.mjs`、`shell-contract.json` | 应用结构检查、独立挂载与撤回测试 |
| `integration/ProgressWindow.cs` | 独立于 Codex 的等待与下载进度窗口 |
| `integration/launcher.mjs`、`media-delivery.mjs` | 私有管道挂载、分批素材传输与配置保存 |
| `integration/fetch-release.mjs`、`install-release.mjs` | 获取签名发行版、备份安装 |
| `docs/MAC_HANDOFF.md` | Mac 接续的设计、已知事实和验收边界 |

## 素材与署名

登录流程参考 `LeeRolling/dsh-boot-suite`；白龙娘原设参考 ZipZipPipe；图标属于 OpenAI。完整来源及第三方许可见 [来源与署名](concept-v4/THIRD-PARTY-NOTICES.md)。仓库包含本项目生成或处理的素材，不包含原作者的参考原图、官方应用包或第三方仓库的角色素材。

本项目为个人定制，不代表 OpenAI 官方功能。公开仓库不改变原角色、图标等第三方内容的权利归属；目前未给整个仓库附加统一开源许可证。
