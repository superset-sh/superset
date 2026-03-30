<div align="center">

<img width="full" alt="Superset" src="apps/marketing/public/images/readme-hero.png" />

### The Code Editor for AI Agents

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/github/license/superset-sh/superset?style=flat)](LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Orchestrate swarms of Claude Code, Codex, and more in parallel.<br />
Works with any CLI agent. Built for local worktree-based development.

<br />

[**Download for macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentation](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## Fork 固有の変更点

このリポジトリは [superset-sh/superset](https://github.com/superset-sh/superset) のフォークです。以下の独自変更が含まれています。

| 変更 | 概要 | PR | 追加日 |
|:-----|:-----|:--:|:------:|
| **Excel/スプレッドシート ビューア** | .xlsx/.xls/.ods ファイルを書式付きで表示。罫線・結合セル・テーマカラー・リッチテキスト対応。複数シートタブ切り替え、コンテナ幅への自動フィット | [#1](https://github.com/MocA-Love/superset/pull/1) | 2026-03-27 |
| **Excel diff ビューア** | スプレッドシートのサイドバイサイド差分表示。セル単位の変更ハイライト、Prev/Next ナビゲーション、左右同期スクロール | [#1](https://github.com/MocA-Love/superset/pull/1) | 2026-03-27 |
| **フォーク版アップデート通知** | 本家 electron-updater を無効化し、GitHub API でフォークリリースをチェックする方式に変更。新バージョン検出時にトースト通知を表示し「Open releases」からダウンロードページへ遷移。4時間ごと＋起動時に自動チェック | [#3](https://github.com/MocA-Love/superset/pull/3) [#17](https://github.com/MocA-Love/superset/pull/17) | 2026-03-29 |
| **ブラウザ webview リロード防止** | タブ/ワークスペース切り替え時に Electron の webview がリロードされる問題を修正。webview を含むタブを keep-alive し、ワークスペースページをルーター上位で保持。WorkspaceIdContext による正しいコンテキスト分離、ホットキーの active-only 制御も実装 | [#2](https://github.com/MocA-Love/superset/pull/2) | 2026-03-28 |
| **マウス戻る/進むボタン対応** | ブラウザ webview 内でマウスの戻る/進むボタンが動作するように対応。macOS は guest ページへのスクリプト注入、Windows/Linux は app-command イベントで処理 | [#2](https://github.com/MocA-Love/superset/pull/2) | 2026-03-28 |
| **AI コミットメッセージ生成** | コミットメッセージ入力欄のスパークルボタンで AI が conventional commit メッセージを日本語で自動生成。階層的要約方式（gptcommit 式）により大量差分でも高精度。staged/unstaged/untracked 全対応、lock ファイル・バイナリ自動スキップ | [#4](https://github.com/MocA-Love/superset/pull/4) | 2026-03-28 |
| **ポートリストのリサイズ・フィルタ** | サイドバーの Ports セクションの高さをドラッグでリサイズ可能に（80–600px、永続化）。フィルタトグルで ports.json に定義されたポートのみ表示し、自動検出ポートを非表示にできる | [#6](https://github.com/MocA-Love/superset/pull/6) | 2026-03-28 |
| **大規模ファイル diff 高速化** | 2000行超のファイルで CodeMirror 6 ベースの仮想化 diff ビューアに自動切替。ビューポート分のDOMのみ描画し、15000行でもスムーズ表示。既存テーマ・シンタックスハイライト再利用、未変更領域の自動折りたたみ | [#5](https://github.com/MocA-Love/superset/pull/5) | 2026-03-28 |
| **ports.json ポートの常時表示** | ports.json に定義されたポートをプロセス検出の有無にかかわらず常にサイドバーに表示。Docker 等で検知できないポートもラベル付きで一覧に出る。検出済みポートは従来通りアクティブ表示、未検出は グレー表示で区別 | [#7](https://github.com/MocA-Love/superset/pull/7) | 2026-03-28 |
| **Ports ワークスペース名の改善** | Ports セクションのワークスペース名をワークツリーのディレクトリ名ベースに変更。同名ワークスペースが複数ある場合でもどのワークツリーか一目で区別可能 | [#8](https://github.com/MocA-Love/superset/pull/8) | 2026-03-28 |
| **ブラウザタブ機能強化** | ズーム倍率表示と [-]/[+] ボタン（Cmd+/- と同期）、target="_blank" リンクや Cmd+click を新しいブラウザタブで開く機能、URL コピーボタンを追加。タブが非表示中でもリンクイベントを正しく処理するグローバルハンドラ実装 | [#10](https://github.com/MocA-Love/superset/pull/10) | 2026-03-29 |
| **タブのポップアウト** | ペインツールバーの Pop out ボタンでタブを独立ウィンドウとして分離。閉じるとメインウィンドウに自動返却。ターミナルセッション維持、preload 同期注入方式で Zustand persist との競合を排除 | [#11](https://github.com/MocA-Love/superset/pull/11) | 2026-03-29 |
| **タブカラー設定** | タブを右クリック → Set Color で13色から背景色を設定可能。ワークスペースセクションと同じカラーパレットを再利用。アクティブ/非アクティブで濃淡が変化し、設定は自動永続化 | [#12](https://github.com/MocA-Love/superset/pull/12) | 2026-03-29 |
| **クラッシュリカバリー強化** | macOS でアプリが白画面/フリーズする問題を修正。GPU クラッシュ時に最大化/フルスクリーンでもコンポジター再構築を実行、レンダラークラッシュ時の自動リロード/再起動、clipboard 操作のエラーハンドリング追加 | [#13](https://github.com/MocA-Love/superset/pull/13) | 2026-03-29 |
| **Excel 描画オブジェクト・斜線表示** | Excel ファイルの描画オブジェクト（線・矩形）とセル斜線を表示。xlsx ZIP から drawing XML を直接パースし、CSS transform 方式の SVG オーバーレイで正確に配置 | [#16](https://github.com/MocA-Love/superset/pull/16) | 2026-03-29 |
| **Chrome 拡張機能インストール** | Chrome Web Store の URL または拡張 ID からブラウザ拡張機能をインストール。CRX ダウンロード・展開、互換性チェック（Electron 非対応 API 検出）、設定画面での管理（有効/無効/削除）。BrowserPane ツールバーに拡張アイコンを表示し、クリックでポップアップウィンドウを表示。GPL ライブラリ不使用、Electron 標準 API のみで自前実装 | [#20](https://github.com/MocA-Love/superset/pull/20) | 2026-03-29 |
| **Excel diff インラインハイライト** | Excel 差分表示で変更セル内のテキスト差分を文字レベルでインライン表示。追加部分は緑、削除部分は赤+取り消し線。セルからはみ出る場合はホバーでツールチップにフル差分を表示 | [#19](https://github.com/MocA-Love/superset/pull/19) | 2026-03-29 |
| **Files タブのツールチップ** | ファイルツリーのファイル/フォルダ名にホバーで相対パスをツールチップ表示。ツールバーのトグルボタンで ON/OFF 切り替え、設定は永続化 | [#22](https://github.com/MocA-Love/superset/pull/22) | 2026-03-29 |
| **Inspect Element（右クリック検証）** | ブラウザペインの右クリックメニューに「Inspect Element」を追加。クリック位置の要素を直接 DevTools でインスペクト可能 | [#23](https://github.com/MocA-Love/superset/pull/23) | 2026-03-30 |
| **Branch ワークスペースの PR 表示対応** | worktree を切らない「branch」タイプのワークスペースでも Review タブに PR 情報・チェック結果・レビューコメントを表示。`getGitHubStatus` / `getGitHubPRComments` が worktree レコード必須だった制限を、`mainRepoPath` へのフォールバックで解消 | [#24](https://github.com/MocA-Love/superset/pull/24) | 2026-03-30 |
| **シェル履歴サジェスト** | ターミナル入力時に ~/.zsh_history からコマンド候補をドロップダウン表示。↑↓で選択、→で確定、Escで破棄。選択中コマンドのフルプレビュー付き（補完部分を緑色で強調）。8件超はスクロール、末尾到達で追加読み込み。設定画面から ON/OFF 切り替え可能 | [#24](https://github.com/MocA-Love/superset/pull/24) | 2026-03-30 |

## Fork のビルド方法 (macOS)

### 前提条件

- [Bun](https://bun.sh/) v1.0+
- Git 2.20+
- Xcode Command Line Tools (`xcode-select --install`)

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/MocA-Love/superset.git
cd superset

# 2. 依存関係のインストール
bun install

# 3. デスクトップアプリをビルド
cd apps/desktop
SUPERSET_WORKSPACE_NAME=superset bun run build

# 4. ビルド成果物を開く
open release
```

`release` フォルダ内の `.dmg` ファイルを開き、Superset.app を Applications にドラッグしてインストールしてください。

> **⚠️ ビルド時の注意**: `bun dev` でアプリを起動中にビルドすると、開発用の環境変数（`SUPERSET_WORKSPACE_NAME=default` 等）がバイナリに焼き込まれ、本番データ（`~/.superset/`）が参照されなくなります。ビルド時は必ず `SUPERSET_WORKSPACE_NAME=superset` を明示的に指定してください。

> **📦 上書きインストールについて**: 公式版の `.dmg` をフォーク版で上書きしても、ワークスペース・ターミナル履歴・設定はすべて `~/.superset/` に保持されるため、データが消えることはありません。

### 開発モードで実行

```bash
bun install
bun run dev --filter=@superset/desktop
```

---

## Code 10x Faster With No Switching Cost

Superset orchestrates CLI-based coding agents across isolated git worktrees, with built-in terminal, review, and open-in-editor workflows.

- **Run multiple agents simultaneously** without context switching overhead
- **Isolate each task** in its own git worktree so agents don't interfere with each other
- **Monitor all your agents** from one place and get notified when they need attention
- **Review and edit changes quickly** with the built-in diff viewer and editor
- **Open any workspace where you need it** with one-click handoff to your editor or terminal

Wait less, ship more.

## Features

| Feature | Description |
|:--------|:------------|
| **Parallel Execution** | Run 10+ coding agents simultaneously on your machine |
| **Worktree Isolation** | Each task gets its own branch and working directory |
| **Agent Monitoring** | Track agent status and get notified when changes are ready |
| **Built-in Diff Viewer** | Inspect and edit agent changes without leaving the app |
| **Workspace Presets** | Automate env setup, dependency installation, and more |
| **Universal Compatibility** | Works with any CLI agent that runs in a terminal |
| **Quick Context Switching** | Jump between tasks as they need your attention |
| **IDE Integration** | Open any workspace in your favorite editor with one click |

## Supported Agents

Superset works with any CLI-based coding agent, including:

| Agent | Status |
|:------|:-------|
| [Claude Code](https://github.com/anthropics/claude-code) | Fully supported |
| [OpenAI Codex CLI](https://github.com/openai/codex) | Fully supported |
| [Cursor Agent](https://docs.cursor.com/agent) | Fully supported |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Fully supported |
| [GitHub Copilot](https://github.com/features/copilot) | Fully supported |
| [OpenCode](https://github.com/opencode-ai/opencode) | Fully supported |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Fully supported |
| Any CLI agent | Will work |

If it runs in a terminal, it runs on Superset

## Requirements

| Requirement | Details |
|:------------|:--------|
| **OS** | macOS (Windows/Linux untested) |
| **Runtime** | [Bun](https://bun.sh/) v1.0+ |
| **Version Control** | Git 2.20+ |
| **GitHub CLI** | [gh](https://cli.github.com/) |
| **Caddy** | [caddy](https://caddyserver.com/docs/install) (for dev server) |

## Getting Started

### Quick Start (Pre-built)

**[Download Superset for macOS](https://github.com/superset-sh/superset/releases/latest)**

### Build from Source

<details>
<summary>Click to expand build instructions</summary>

**1. Clone the repository**

```bash
git clone https://github.com/superset-sh/superset.git
cd superset
```

**2. Set up environment variables** (choose one):

Option A: Full setup
```bash
cp .env.example .env
# Edit .env and fill in the values
```

Option B: Skip env validation (for quick local testing)
```bash
cp .env.example .env
echo 'SKIP_ENV_VALIDATION=1' >> .env
```

**3. Set up Caddy** (reverse proxy for Electric SQL streams):

```bash
# Install caddy: brew install caddy (macOS) or see https://caddyserver.com/docs/install
cp Caddyfile.example Caddyfile
```

**4. Install dependencies and run**

```bash
bun install
bun run dev
```

**5. Build the desktop app**

```bash
bun run build
open apps/desktop/release
```

</details>

## Keyboard Shortcuts

All shortcuts are customizable via **Settings > Keyboard Shortcuts** (`⌘/`). See [full documentation](https://docs.superset.sh/keyboard-shortcuts).

### Workspace Navigation

| Shortcut | Action |
|:---------|:-------|
| `⌘1-9` | Switch to workspace 1-9 |
| `⌘⌥↑/↓` | Previous/next workspace |
| `⌘N` | New workspace |
| `⌘⇧N` | Quick create workspace |
| `⌘⇧O` | Open project |

### Terminal

| Shortcut | Action |
|:---------|:-------|
| `⌘T` | New tab |
| `⌘W` | Close pane/terminal |
| `⌘D` | Split right |
| `⌘⇧D` | Split down |
| `⌘K` | Clear terminal |
| `⌘F` | Find in terminal |
| `⌘⌥←/→` | Previous/next tab |
| `Ctrl+1-9` | Open preset 1-9 |

### Layout

| Shortcut | Action |
|:---------|:-------|
| `⌘B` | Toggle workspaces sidebar |
| `⌘L` | Toggle changes panel |
| `⌘O` | Open in external app |
| `⌘⇧C` | Copy path |

## Configuration

Configure workspace setup and teardown in `.superset/config.json`. See [full documentation](https://docs.superset.sh/setup-teardown-scripts).

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"]
}
```

| Option | Type | Description |
|:-------|:-----|:------------|
| `setup` | `string[]` | Commands to run when creating a workspace |
| `teardown` | `string[]` | Commands to run when deleting a workspace |

### Example setup script

```bash
#!/bin/bash
# .superset/setup.sh

# Copy environment variables
cp ../.env .env

# Install dependencies
bun install

# Run any other setup tasks
echo "Workspace ready!"
```

Scripts have access to environment variables:
- `SUPERSET_WORKSPACE_NAME` — Name of the workspace
- `SUPERSET_ROOT_PATH` — Path to the main repository

## Mastra Dependencies

This repo uses the published upstream `mastracode` and `@mastra/*` packages directly. Avoid adding custom tarball overrides unless there is a repo-specific blocker.

## Tech Stack

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

## Private by Default

- **Source Available** — Full source is available on GitHub under Elastic License 2.0 (ELv2).
- **Explicit Connections** — You choose which agents, providers, and integrations to connect.

## Contributing

We welcome contributions! If you have a suggestion that would make Superset better:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

You can also [open issues](https://github.com/superset-sh/superset/issues) for bugs or feature requests.

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions and code of conduct.

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Community

Join the Superset community to get help, share feedback, and connect with other users:

- **[Discord](https://discord.gg/cZeD9WYcV7)** — Chat with the team and community
- **[Twitter](https://x.com/superset_sh)** — Follow for updates and announcements
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)** — Report bugs and request features
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)** — Ask questions and share ideas

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## License

Distributed under the Elastic License 2.0 (ELv2). See [LICENSE.md](LICENSE.md) for more information.
