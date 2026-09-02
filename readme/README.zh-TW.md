<div align="center">

<img width="full" alt="Claude 與 OpenCode 在平行的 Superset 工作區中工作並即時顯示差異" src="../apps/marketing/public/images/readme-hero.gif" />

### 平行執行 100+ 個編碼代理程式

<details>
<summary>🌐 其他語言版本</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*本文件為英文版 README 的翻譯,內容以英文版為準。*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code、Codex 或任何 CLI 代理程式,各自執行在獨立的 worktree 中。<br />
把時間花在交付上,而不是等待上。

<br />

[**下載 macOS 版**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [文件](https://docs.superset.sh) &nbsp;&bull;&nbsp; [更新日誌](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 零切換成本,寫程式快 10 倍

Superset 在相互隔離的 git worktree 中平行執行以 CLI 為基礎的編碼代理程式,並內建終端、審查以及在編輯器中開啟的工作流程。

- **同時執行多個代理程式**,沒有情境切換的負擔
- **將每項任務隔離**在獨立的 git worktree 中,代理程式之間互不干擾
- **在同一個地方監控所有代理程式**,需要你介入時會收到通知
- **快速審查與編輯變更**,使用內建的差異檢視器和編輯器
- **在任何需要的地方開啟工作區**,一鍵交接到你的編輯器或終端
- **隨時隨地存取你的工作區**,透過遠端主機、CLI、SDK 或 MCP

少等待,多交付。

## 功能

<table>
<tr>
<td width="50%" valign="middle">

### 平行工作區

一次執行 100+ 個編碼代理程式,每個都在自己的 git worktree 中,擁有獨立的分支、終端和環境。比較結果,合併最佳方案。

[文件 →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="Claude 正在串流輸出一次計費系統遷移,其他代理程式在平行工作區中執行" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 代理程式監控

從側邊欄追蹤每個代理程式,搭配工作指示器、完成提示音,以及需要你介入時的 Dock 徽章。

[文件 →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="一個代理程式完成任務,側邊欄狀態從工作中切換為已完成" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 內建終端

分頁、無限分割、預設,以及重新啟動後依然保留的持續性工作階段。按 ⌘I 開啟富文字提示編輯器,支援多行編輯和 @ 檔案提及。

[文件 →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="在分割終端旁的富文字提示編輯器中輸入帶 @ 檔案提及的後續指令" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 內建差異檢視器

不必離開應用程式即可檢視、評論和編輯代理程式的變更,準備就緒後提交並推送。

[文件 →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="在差異檢視器中審查代理程式的變更" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 應用程式內瀏覽器與連接埠

在瀏覽器窗格中預覽正在執行的開發伺服器。連接埠依工作區偵測,每個 worktree 都有自己的預覽。

[文件 →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="應用程式內瀏覽器預覽開發伺服器並顯示偵測到的連接埠" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 自動化

依排程執行代理程式工作階段:夜間分類 issue、草擬每週更新日誌、讓相依套件保持最新。

[文件 →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="依排程執行的代理程式自動化" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 遠端存取

連接另一台機器,隨時隨地存取它的工作區:桌面應用程式、CLI 或手機。用自訂命令喚醒離線主機。

[文件 →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="組織設定中的主機與成員" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

在任何 shell 中撰寫指令碼:用單一執行檔建立工作區、啟動代理程式、讀取它們的終端、管理自動化。只要代理程式能執行命令,它就能操作 Superset。

[文件 →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="透過 Superset CLI 建立工作區並啟動代理程式" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 命令面板

在同一個搜尋框中跳轉到任何工作區、動作或設定。

[文件 →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="在命令面板中輸入並即時篩選工作區動作" width="100%" /></a>
</td>
</tr>
</table>

**隨附的還有:**

- **[內建技能](https://docs.superset.sh/skills)**:代理程式預載 `superset:*` 技能(協調平行代理程式、排程自動化、回報意見、診斷問題),啟動時自動佈建
- **[模型選擇器與自訂代理程式](https://docs.superset.sh/agent-integration)**:啟動時選擇模型和推理力度,並可為任何終端代理程式加上專屬圖示
- **[工作區設定指令碼](https://docs.superset.sh/setup-teardown-scripts)**:依工作區自動化環境設定、相依套件安裝和開發伺服器
- **[終端預設](https://docs.superset.sh/terminal-presets)**:儲存代理程式和 shell 版面配置,一鍵開啟
- **[Slack 與 Linear](https://docs.superset.sh/use-with-linear)**:從 Slack 訊息或 Linear issue 直接建立工作區
- **[在你的 IDE 中開啟](https://docs.superset.sh/use-with-ide)**:一鍵交接到 Cursor、VS Code 或任何編輯器
- **[自訂佈景主題](https://docs.superset.sh/custom-themes)**:建立、編輯和匯入佈景主題檔案
- **[鍵盤快速鍵](https://docs.superset.sh/keyboard-shortcuts)**:每個動作都可透過**設定 → 鍵盤快速鍵**(⌘/)重新對應
- **[自帶供應商](https://docs.superset.sh/providers)**:連接 OpenRouter、Bedrock、Vertex 或 Vercel AI Gateway
- **還有更多**:我們每天出貨,這份清單永遠落後於實際。真正的功能清單是[更新日誌](https://superset.sh/changelog)。

## 支援的代理程式

Superset 適用於任何以 CLI 為基礎的編碼代理程式,包括:

| 代理程式 | 狀態 |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 完整支援 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 完整支援 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 完整支援 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 完整支援 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 完整支援 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 完整支援 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 完整支援 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 完整支援 |
| 任何其他 CLI 代理程式 | 無需設定即可使用 |

只要能在終端裡執行,就能在 Superset 上執行

代理程式得到的不只是一個終端:

- **模型選擇器**:啟動代理程式時選擇模型和推理力度
- **依代理程式設定**:在設定 → 代理程式中調整啟動命令、提示範本和模型覆寫
- **自訂代理程式**:加入任何終端代理程式並配上專屬圖示,它就和內建的一樣運作
- **狀態與通知**:工作指示器、完成提示音,以及代理程式需要你時的 Dock 徽章
- **內建聊天**:在聊天窗格中與模型對話,支援內嵌工具核准和計畫審查

## 不只是一個桌面應用程式

每個介面都連接到同樣的工作區,你可以在應用程式中開始一項任務,然後在任何地方查看進度。

| 介面 | 你能得到什麼 |
|:--------|:-------------|
| [**桌面應用程式**](https://github.com/superset-sh/superset/releases/latest) | 完整的 IDE:終端、差異檢視器、應用程式內瀏覽器、自動化 |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | 單一 `superset` 執行檔,在任何 shell 中管理工作區、代理程式、終端和主機 |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | 透過 [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk) 在 Node、Bun 或 Deno 中以程式方式操作 Superset |
| [**MCP 伺服器**](https://docs.superset.sh/mcp) | 讓 Claude Code、Codex、Cursor 等代理程式自己建立和管理工作區 |

CLI 隨桌面應用程式一起提供,也可以獨立安裝:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

iOS 應用程式即將推出,讓你可以在手機上查看你的代理程式。

## 安裝

下載桌面應用程式:

- **macOS**:[Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**:[x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage)(實驗性;macOS 是主要目標平台)
- **Windows**:暫不提供
- [所有建置版本](https://github.com/superset-sh/superset/releases/latest)

你只需要安裝 [Git](https://git-scm.com/)。[gh](https://cli.github.com/) 是選用的,可解鎖 PR 工作流程;Superset 會主動提議為你安裝。

## 開發

想研究 Superset 或貢獻一個 PR?複製儲存庫,把它加入已安裝的 Superset 應用程式,然後為你的變更建立一個工作區:

```bash
git clone https://github.com/superset-sh/superset.git
```

然後在該工作區的終端中執行開發環境設定:

```bash
./.superset/setup.local.sh
bun run dev
```

在每個新的 worktree 中執行一次 `setup.local.sh`。它會設定工作區專屬的應用程式識別與連接埠,讓開發版桌面應用程式可以與已安裝的 Superset 應用程式及其他開發 worktree 並行執行。

不需要 Neon 帳號或第三方憑證。`setup.local.sh` 會透過 Docker 啟動本機 Postgres + Electric 堆疊並植入一個開發帳號。用 **「Sign in as dev」**按鈕(或 `admin@local.test` / `supersetdev`)登入即可。

先決條件:[Bun](https://bun.sh/) v1.3.14+(固定在 `.bun-version` 中)、`docker`、`jq` 和 `caddy`,`bun dev` 會將 `caddy` 作為本機 HTTPS 代理伺服器執行(`brew install jq caddy && caddy trust`)。

完整指南見 [**DEVELOPMENT.md**](../DEVELOPMENT.md):設定指令碼做了什麼、針對真實服務的手動設定、常用命令、疑難排解,以及如何建置桌面應用程式。貢獻流程見 [**CONTRIBUTING.md**](../CONTRIBUTING.md)。

## 組態

在 `.superset/config.json` 中設定工作區的設定、清理和執行指令碼。參見[完整文件](https://docs.superset.sh/setup-teardown-scripts)。

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

鍵盤快速鍵可透過**設定 → 鍵盤快速鍵**(⌘/)自訂;參見[完整快速鍵清單](https://docs.superset.sh/keyboard-shortcuts)。

## 技術堆疊

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

## 預設保持私密

- **原始碼公開**:完整原始碼以 Elastic License 2.0(ELv2)授權發布在 GitHub 上。
- **明確連接**:由你決定要連接哪些代理程式、供應商和整合。

## 貢獻

我們歡迎貢獻!參見 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何建置環境並提交 PR。Bug 和功能請求請提交到 [issues](https://github.com/superset-sh/superset/issues)。

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## 社群

加入 Superset 社群,取得協助、分享意見,並與其他使用者交流:

- **[Discord](https://discord.gg/cZeD9WYcV7)**:與團隊和社群聊天
- **[Twitter](https://x.com/superset_sh)**:追蹤以取得更新和公告
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**:回報 bug 和請求功能
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**:提問和分享想法

### 團隊

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## 授權與永久免費的部分

**桌面應用程式永久免費。**在你自己的機器上平行執行代理程式永遠不需要付費。我們若收費,也會是建立在其上的選用服務。

整個應用程式都在這個儲存庫中,採用 [Elastic License 2.0](../LICENSE.md) 授權:使用它、fork 它、修改它、為你的團隊自行架設,都可以。唯一不允許的,是把 Superset 本身重新包裝成服務販售給他人。
