<div align="center">

<img width="full" alt="Claude 与 OpenCode 在并行的 Superset 工作区中工作并实时显示差异" src="../apps/marketing/public/images/readme-hero.gif" />

### 并行运行 100+ 个编码智能体

<details>
<summary>🌐 其他语言版本</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*本文档是英文版 README 的翻译,内容以英文版为准。*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code、Codex 或任何 CLI 智能体,各自运行在独立的 worktree 中。<br />
把时间花在交付上,而不是等待上。

<br />

[**下载 macOS 版**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [文档](https://docs.superset.sh) &nbsp;&bull;&nbsp; [更新日志](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 零切换成本,编码快 10 倍

Superset 在相互隔离的 git worktree 中并行运行基于 CLI 的编码智能体,并内置终端、审查和在编辑器中打开的工作流。

- **同时运行多个智能体**,没有上下文切换的开销
- **将每个任务隔离**在独立的 git worktree 中,智能体之间互不干扰
- **在一个地方监控所有智能体**,需要你介入时会收到通知
- **快速审查和编辑更改**,使用内置的差异查看器和编辑器
- **在任何需要的地方打开工作区**,一键交接到你的编辑器或终端
- **随时随地访问你的工作区**,通过远程主机、CLI、SDK 或 MCP

少等待,多交付。

## 功能

<table>
<tr>
<td width="50%" valign="middle">

### 并行工作区

一次运行 100+ 个编码智能体,每个都在自己的 git worktree 中,拥有独立的分支、终端和环境。比较结果,合并最优方案。

[文档 →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude 正在流式输出一次计费迁移,其他智能体在并行工作区中运行" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 智能体监控

从侧边栏跟踪每个智能体,配有工作指示器、完成提示音,以及需要你介入时的 Dock 徽标。

[文档 →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="一个智能体完成任务,侧边栏状态从工作中切换为已完成" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内置终端

标签页、无限分屏、预设,以及在重启后依然保留的持久会话。按 ⌘I 打开富文本提示词编辑器,支持多行编辑和 @ 文件提及。

[文档 →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="在分屏终端旁的富文本提示词编辑器中输入带 @ 文件提及的后续指令" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内置差异查看器

无需离开应用即可检查、评论和编辑智能体的更改,准备就绪后提交并推送。

[文档 →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="在差异查看器中审查智能体的更改" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 应用内浏览器与端口

在浏览器窗格中预览正在运行的开发服务器。端口按工作区检测,每个 worktree 都有自己的预览。

[文档 →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="应用内浏览器预览开发服务器并显示检测到的端口" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 自动化

按计划运行智能体会话:夜间分诊 issue、起草每周更新日志、保持依赖最新。

[文档 →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="按计划运行的智能体自动化" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 远程访问

连接另一台机器,随时随地访问它的工作区:桌面应用、CLI 或手机。用自定义命令唤醒离线主机。

[文档 →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="组织设置中的主机与成员" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

在任何 shell 中编写脚本:用单个二进制文件创建工作区、启动智能体、读取它们的终端、管理自动化。只要智能体能运行命令,它就能驱动 Superset。

[文档 →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="通过 Superset CLI 创建工作区并启动智能体" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 命令面板

在一个搜索框中跳转到任何工作区、操作或设置。

[文档 →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="在命令面板中输入并实时筛选工作区操作" width="100%" /></a>
</td>
</tr>
</table>

**开箱即用的还有:**

- **[内置技能](https://docs.superset.sh/skills)**:智能体预装 `superset:*` 技能(编排并行智能体、安排自动化、提交反馈、诊断问题),启动时自动配置
- **[模型选择器与自定义智能体](https://docs.superset.sh/agent-integration)**:启动时选择模型和推理力度,并可为任何终端智能体添加专属图标
- **[工作区设置脚本](https://docs.superset.sh/setup-teardown-scripts)**:按工作区自动化环境配置、依赖安装和开发服务器
- **[终端预设](https://docs.superset.sh/terminal-presets)**:保存智能体和 shell 布局,一键打开
- **[Slack 与 Linear](https://docs.superset.sh/use-with-linear)**:从 Slack 消息或 Linear issue 直接创建工作区
- **[在你的 IDE 中打开](https://docs.superset.sh/use-with-ide)**:一键交接到 Cursor、VS Code 或任何编辑器
- **[自定义主题](https://docs.superset.sh/custom-themes)**:构建、编辑和导入主题文件
- **[键盘快捷键](https://docs.superset.sh/keyboard-shortcuts)**:每个操作都可通过**设置 → 键盘快捷键**(⌘/)重新映射
- **[自带提供商](https://docs.superset.sh/providers)**:连接 OpenRouter、Bedrock、Vertex 或 Vercel AI Gateway
- **还有更多**:我们每天发布新版本,这份列表永远落后于实际。真正的功能列表是[更新日志](https://superset.sh/changelog)。

## 支持的智能体

Superset 适用于任何基于 CLI 的编码智能体,包括:

| 智能体 | 状态 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 完全支持 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 完全支持 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 完全支持 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 完全支持 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 完全支持 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 完全支持 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 完全支持 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 完全支持 |
| 任何其他 CLI 智能体 | 无需配置即可使用 |

只要能在终端里运行,就能在 Superset 上运行

智能体得到的不只是一个终端:

- **模型选择器**:启动智能体时选择模型和推理力度
- **按智能体设置**:在设置 → 智能体中调整启动命令、提示词模板和模型覆盖
- **自定义智能体**:添加任何终端智能体并配上专属图标,它就像内置的一样工作
- **状态与通知**:工作指示器、完成提示音,以及智能体需要你时的 Dock 徽标
- **内置聊天**:在聊天窗格中与模型对话,支持内联工具批准和计划审查

## 不只是一个桌面应用

每个界面都连接到同样的工作区,你可以在应用里开始一个任务,然后在任何地方查看进展。

| 界面 | 你能得到什么 |
|:--------|:-------------|
| [**桌面应用**](https://github.com/superset-sh/superset/releases/latest) | 完整的 IDE:终端、差异查看器、应用内浏览器、自动化 |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | 单个 `superset` 二进制文件,在任何 shell 中管理工作区、智能体、终端和主机 |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | 通过 [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) 在 Node、Bun 或 Deno 中以编程方式驱动 Superset |
| [**MCP 服务器**](https://docs.superset.sh/mcp) | 让 Claude Code、Codex、Cursor 等智能体自己创建和管理工作区 |

CLI 随桌面应用一起提供,也可以独立安装:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

iOS 应用即将推出,让你可以在手机上查看你的智能体。

## 安装

下载桌面应用:

- **macOS**:[Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**:[x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage)(实验性;macOS 是主要目标平台)
- **Windows**:暂不可用
- [所有构建版本](https://github.com/superset-sh/superset/releases/latest)

你只需要安装 [Git](https://git-scm.com/)。[gh](https://cli.github.com/) 是可选的,用于解锁 PR 工作流;Superset 会主动提议为你安装。

## 开发

想折腾 Superset 或贡献一个 PR?克隆仓库,把它添加到已安装的 Superset 应用中,然后为你的更改创建一个工作区:

```bash
git clone https://github.com/superset-sh/superset.git
```

然后在该工作区的终端中运行开发环境设置:

```bash
./.superset/setup.local.sh
bun run dev
```

在每个新 worktree 中运行一次 `setup.local.sh`。它会配置工作区专属的应用标识和端口,让开发版桌面应用可以与已安装的 Superset 应用及其他开发 worktree 并行运行。

无需 Neon 账号或第三方凭据。`setup.local.sh` 会通过 Docker 启动本地 Postgres + Electric 栈并植入一个开发账号。用 **"Sign in as dev"** 按钮(或 `admin@local.test` / `supersetdev`)登录即可。

前置条件:[Bun](https://bun.sh/) v1.3.14+(固定在 `.bun-version` 中)、`docker`、`jq` 和 `caddy`,`bun dev` 会将 `caddy` 作为本地 HTTPS 代理运行(`brew install jq caddy && caddy trust`)。

完整指南见 [**DEVELOPMENT.md**](../DEVELOPMENT.md):设置脚本做了什么、针对真实服务的手动设置、常用命令、故障排查,以及如何构建桌面应用。贡献流程见 [**CONTRIBUTING.md**](../CONTRIBUTING.md)。

## 配置

在 `.superset/config.json` 中配置工作区的设置、清理和运行脚本。参见[完整文档](https://docs.superset.sh/setup-teardown-scripts)。

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

键盘快捷键可通过**设置 → 键盘快捷键**(⌘/)自定义;参见[完整快捷键列表](https://docs.superset.sh/keyboard-shortcuts)。

## 技术栈

<p>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB" alt="React" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white" alt="TailwindCSS" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://turbo.build/"><img src="https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://biomejs.dev/"><img src="https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white" alt="Biome" /></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white" alt="Neon" /></a>
  <a href="https://trpc.io/"><img src="https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white" alt="tRPC" /></a>
</p>

## 默认私密

- **源码可见**:完整源码以 Elastic License 2.0(ELv2)许可发布在 GitHub 上。
- **显式连接**:由你决定连接哪些智能体、提供商和集成。

## 贡献

我们欢迎贡献!参见 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何搭建环境并提交 PR。Bug 和功能请求请提交到 [issues](https://github.com/superset-sh/superset/issues)。

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## 社区

加入 Superset 社区,获取帮助、分享反馈,并与其他用户交流:

- **[Discord](https://discord.gg/cZeD9WYcV7)**:与团队和社区聊天
- **[Twitter](https://x.com/superset_sh)**:关注以获取更新和公告
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**:报告 bug 和请求功能
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**:提问和分享想法

### 团队

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 许可与永久免费的部分

**桌面应用永久免费。**在你自己的机器上并行运行智能体永远不需要付费。我们收费的任何东西都会是在此之上的可选服务。

整个应用都在这个仓库中,采用 [Elastic License 2.0](../LICENSE.md) 许可:使用它、fork 它、修改它、为你的团队自托管它,都可以。唯一不允许的,是把 Superset 本身重新打包成服务卖给他人。
