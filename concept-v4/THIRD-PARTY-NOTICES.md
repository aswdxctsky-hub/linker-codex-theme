# 来源与署名

## 登录流程参考

流程与声音结束后推进的处理参考 [LeeRolling/dsh-boot-suite](https://github.com/LeeRolling/dsh-boot-suite)，前版查阅版本 baec191c80fa057cab690997e269392dc9ca841e。原作者沈宏宏，整合与维护 LeeRolling。已查看 README.md、AUDIO-FIELDS.md、CREDITS.md 与 lib/splash.js，并参考[作者的演示视频](https://www.bilibili.com/video/BV1wspE6EE8b/)。

V4 延续六段访问骨架和模拟虹膜扫描，扩展为八路权限与独立登场转场。借鉴每阶段等待语音结束，以及登录、角色、聊天三幕的衔接方式。界面与预览实现为本地重新编写；本包不含仓库的角色、配音、安装器、注入代码或更新器。

MIT License

Copyright (c) 2026 沈宏宏

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 白龙娘与背景

白龙娘原设参考 [ZipZipPipe 原作](https://www.bilibili.com/opus/1238613841710940181)。角色上半身与主题背景由前版使用内置 image_gen 生成，本轮保持不变。生成提示词保存在 assets/image-prompts.json。

原角色动画由 HeyGen Video 1 生成，8 秒，中文原片及声音保持不变，来源记录见 assets/animation-source.json。英文版本沿用该动画，使用新生成的目录配音进行 HeyGen precision 口型适配，没有克隆角色原声；来源记录见 assets/animation-en-source.json。角色原创设计权利仍归原作者，未将其原创设定声明为本项目作品。

## 官方图标

GPT 图标来自本机官方 OpenAI.Codex 26.1029.7803.0 的 chatgpt-app-light.ico / chatgpt-app-dark.ico，转换为 PNG，保留原形、颜色与比例。图标属于 OpenAI，参见 [OpenAI 品牌资源](https://openai.com/brand/)。这是个人视觉概念稿，不代表 OpenAI 官方界面。

## 配音与音效

中文认证语音沿用 HeyGen 的 Shuxian - Clear & Trustworthy，voiceId 为 6c364011f30747c9a0a89eec3787cadc，原始语音长度 20.8718367 秒。英文认证与问候使用 Lowenna - Clear & Reassuring，voiceId 为 43242ecbb86842d7b5af1c2dad0dbd16，本次单次原始合成长度 21.3681633 秒。两次均使用保存的默认引擎，返回记录为 orca。原音、返回的词时间戳和分段映射均随包保存。

两套认证语音均加入较强的环形调制、共振和短延迟效果，保留自然播放速度。原始配音单独保存。提示音、权限接通音与信号扩散声由 Web Audio 合成。全部音声来自本项目的生成或制作，不使用仓库的第三方配音。
