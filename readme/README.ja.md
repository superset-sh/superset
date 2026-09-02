<div align="center">

<img width="full" alt="並列のSupersetワークスペースでライブ差分を表示しながら動作するClaudeとOpenCode" src="../apps/marketing/public/images/readme-hero.gif" />

### 100以上のコーディングエージェントを並列実行

<details>
<summary>🌐 他の言語で読む</summary>
<br />

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Türkçe](README.tr.md) | [Polski](README.pl.md) | [Nederlands](README.nl.md) | [Bahasa Indonesia](README.id.md) | [Čeština](README.cs.md) | [Tiếng Việt](README.vi.md)

</details>

*本ドキュメントは英語版READMEの翻訳です。内容は英語版が正となります。*

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/badge/license-Elastic%20License%202.0-blue?style=flat)](../LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

Claude Code、Codex、その他あらゆるCLIエージェントを、それぞれ独立したworktreeで実行。<br />
待つ時間ではなく、出荷する時間に使いましょう。

<br />

[**macOS版をダウンロード**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [ドキュメント](https://docs.superset.sh) &nbsp;&bull;&nbsp; [変更履歴](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />


</div>

## 切り替えコストなしで10倍速くコーディング

Supersetは、CLIベースのコーディングエージェントを独立したgit worktree間で並列実行します。ターミナル、レビュー、エディタで開くワークフローも内蔵しています。

- **複数のエージェントを同時に実行** — コンテキスト切り替えのオーバーヘッドはありません
- **各タスクを独立したgit worktreeに分離** — エージェント同士が干渉しません
- **すべてのエージェントを一箇所で監視** — 対応が必要になれば通知が届きます
- **変更をすばやくレビュー・編集** — 内蔵の差分ビューアとエディタで
- **必要な場所でワークスペースを開く** — ワンクリックでエディタやターミナルへ引き継ぎ
- **どこからでもワークスペースにアクセス** — リモートホスト、CLI、SDK、MCP経由で

待ち時間を減らして、もっと出荷しましょう。

## 機能

<table>
<tr>
<td width="50%" valign="middle">

### 並列ワークスペース

100以上のコーディングエージェントを一度に実行。それぞれが独自のブランチ、ターミナル、環境を持つgit worktreeで動作します。結果を比較して、最良のものをマージしましょう。

[ドキュメント →](https://docs.superset.sh/workspaces)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/workspaces"><img src="../apps/marketing/public/images/readme/agents-working.gif" alt="他のエージェントが並列ワークスペースで動作する中、課金システムの移行をストリーミングするClaude" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### エージェント監視

サイドバーからすべてのエージェントを追跡。作業中インジケーター、完了チャイム、対応が必要なときのDockバッジ付きです。

[ドキュメント →](https://docs.superset.sh/agent-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/agent-integration"><img src="../apps/marketing/public/images/readme/agent-monitoring.gif" alt="タスクを完了したエージェントと、作業中から完了に切り替わるサイドバーのステータス" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内蔵ターミナル

タブ、無制限の分割、プリセット、再起動後も維持される永続セッション。⌘Iを押すと、複数行編集と@ファイルメンションに対応したリッチプロンプトエディタが開きます。

[ドキュメント →](https://docs.superset.sh/terminal-integration)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/terminal-integration"><img src="../apps/marketing/public/images/readme/terminal.gif" alt="分割ターミナルの隣で、リッチプロンプトエディタに@ファイルメンション付きのフォローアップを入力する様子" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 内蔵差分ビューア

アプリを離れずにエージェントの変更を確認・コメント・編集し、準備ができたらコミットしてプッシュできます。

[ドキュメント →](https://docs.superset.sh/diff-viewer)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/diff-viewer"><img src="../apps/marketing/public/images/readme/diff-viewer.png" alt="差分ビューアでエージェントの変更をレビューする様子" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### アプリ内ブラウザとポート

実行中の開発サーバーをブラウザペインでプレビュー。ポートはワークスペースごとに検出されるため、各worktreeが独自のプレビューを持てます。

[ドキュメント →](https://docs.superset.sh/browser)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/browser"><img src="../apps/marketing/public/images/readme/browser-ports.png" alt="検出されたポートで開発サーバーをプレビューするアプリ内ブラウザ" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### オートメーション

エージェントセッションをスケジュール実行:夜間にissueをトリアージし、週次の変更履歴を下書きし、依存関係を最新に保ちます。

[ドキュメント →](https://docs.superset.sh/automations)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/automations"><img src="../apps/marketing/public/images/readme/automations.png" alt="スケジュールされたエージェントオートメーション" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### リモートアクセス

別のマシンを接続し、そのワークスペースにどこからでもアクセス:デスクトップアプリ、CLI、スマートフォンから。オフラインのホストはカスタムコマンドで起動できます。

[ドキュメント →](https://docs.superset.sh/remote-access)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/remote-access"><img src="../apps/docs/public/images/remote-workspaces-hosts-members.png" alt="組織設定のホストとメンバー" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Superset CLI

どのシェルからでもスクリプト化:ワークスペースの作成、エージェントの起動、ターミナルの読み取り、オートメーションの管理を単一のバイナリで。コマンドを実行できるエージェントなら、Supersetを操作できます。

[ドキュメント →](https://docs.superset.sh/cli/getting-started)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/cli/getting-started"><img src="../apps/marketing/public/images/readme/cli-demo.gif" alt="Superset CLIからワークスペースを作成してエージェントを起動する様子" width="100%" /></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### コマンドパレット

1つの検索ボックスから任意のワークスペース、アクション、設定にジャンプ。

[ドキュメント →](https://docs.superset.sh/keyboard-shortcuts)

</td>
<td width="50%">
  <a href="https://docs.superset.sh/keyboard-shortcuts"><img src="../apps/marketing/public/images/readme/command-palette.gif" alt="コマンドパレットに入力してワークスペースのアクションをリアルタイムに絞り込む様子" width="100%" /></a>
</td>
</tr>
</table>

**さらに同梱されている機能:**

- **[内蔵スキル](https://docs.superset.sh/skills)**: エージェントには `superset:*` スキル(並列エージェントのオーケストレーション、オートメーションのスケジュール、フィードバックの送信、問題の診断)が起動時に自動でプロビジョニングされます
- **[モデルピッカーとカスタムエージェント](https://docs.superset.sh/agent-integration)**: 起動時にモデルと推論の強度を選択でき、任意のターミナルエージェントを独自のアイコン付きで追加できます
- **[ワークスペースセットアップスクリプト](https://docs.superset.sh/setup-teardown-scripts)**: 環境設定、依存関係のインストール、開発サーバーの起動をワークスペースごとに自動化
- **[ターミナルプリセット](https://docs.superset.sh/terminal-presets)**: エージェントとシェルのレイアウトを保存し、キー1つで開けます
- **[SlackとLinear](https://docs.superset.sh/use-with-linear)**: SlackメッセージやLinearのissueからワークスペースを立ち上げ
- **[IDEで開く](https://docs.superset.sh/use-with-ide)**: Cursor、VS Code、任意のエディタへワンクリックで引き継ぎ
- **[カスタムテーマ](https://docs.superset.sh/custom-themes)**: テーマファイルの作成、編集、インポート
- **[キーボードショートカット](https://docs.superset.sh/keyboard-shortcuts)**: すべてのアクションは**設定 → キーボードショートカット**(⌘/)で再割り当てできます
- **[プロバイダーの持ち込み](https://docs.superset.sh/providers)**: OpenRouter、Bedrock、Vertex、Vercel AI Gatewayを接続
- **その他多数**: 毎日出荷しているため、このリストは常に追いついていません。本当の機能リストは[変更履歴](https://superset.sh/changelog)です。

## 対応エージェント

Supersetは、次のものを含むあらゆるCLIベースのコーディングエージェントで動作します:

| エージェント | ステータス |
|:------|:-------|
| <img height="16" align="top" alt="Amp Code" src="../packages/ui/src/assets/icons/preset-icons/amp.svg" /> &nbsp;[Amp Code](https://ampcode.com/) | 完全対応 |
| <img height="16" align="top" alt="Antigravity" src="../packages/ui/src/assets/icons/preset-icons/antigravity.svg" /> &nbsp;[Antigravity CLI](https://antigravity.google/) | 完全対応 |
| <img height="16" align="top" alt="Claude Code" src="../packages/ui/src/assets/icons/preset-icons/claude.svg" /> &nbsp;[Claude Code](https://github.com/anthropics/claude-code) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/codex-white.svg" /><img height="16" align="top" alt="OpenAI Codex CLI" src="../packages/ui/src/assets/icons/preset-icons/codex.svg" /></picture> &nbsp;[OpenAI Codex CLI](https://github.com/openai/codex) | 完全対応 |
| <img height="16" align="top" alt="Cursor Agent" src="../packages/ui/src/assets/icons/preset-icons/cursor.svg" /> &nbsp;[Cursor Agent](https://docs.cursor.com/agent) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/droid-white.svg" /><img height="16" align="top" alt="Droid" src="../packages/ui/src/assets/icons/preset-icons/droid.svg" /></picture> &nbsp;[Droid](https://www.factory.ai/) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/fx-white.svg" /><img height="16" align="top" alt="fx" src="../packages/ui/src/assets/icons/preset-icons/fx.svg" /></picture> &nbsp;[fx](https://fx.sh/) | 完全対応 |
| <img height="16" align="top" alt="Gemini CLI" src="../packages/ui/src/assets/icons/preset-icons/gemini.svg" /> &nbsp;[Gemini CLI](https://github.com/google-gemini/gemini-cli) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/copilot-white.svg" /><img height="16" align="top" alt="GitHub Copilot" src="../packages/ui/src/assets/icons/preset-icons/copilot.svg" /></picture> &nbsp;[GitHub Copilot](https://github.com/features/copilot) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/grok-white.svg" /><img height="16" align="top" alt="Grok" src="../packages/ui/src/assets/icons/preset-icons/grok.svg" /></picture> &nbsp;[Grok](https://x.ai/) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/hermes-white.svg" /><img height="16" align="top" alt="Hermes" src="../packages/ui/src/assets/icons/preset-icons/hermes.svg" /></picture> &nbsp;[Hermes](https://github.com/NousResearch/hermes-agent) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/kimi-white.svg" /><img height="16" align="top" alt="Kimi Code" src="../packages/ui/src/assets/icons/preset-icons/kimi.svg" /></picture> &nbsp;[Kimi Code](https://www.kimi.com/) | 完全対応 |
| <img height="16" align="top" alt="Kiro" src="../packages/ui/src/assets/icons/preset-icons/kiro.svg" /> &nbsp;[Kiro](https://kiro.dev/cli/) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/mastracode-white.svg" /><img height="16" align="top" alt="Mastra Code" src="../packages/ui/src/assets/icons/preset-icons/mastracode.svg" /></picture> &nbsp;[Mastra Code](https://mastra.ai/) | 完全対応 |
| <img height="16" align="top" alt="Mistral Vibe" src="../packages/ui/src/assets/icons/preset-icons/vibe.svg" /> &nbsp;[Mistral Vibe](https://mistral.ai/) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Oh My Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Oh My Pi](https://github.com/can1357/oh-my-pi) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/opencode-white.svg" /><img height="16" align="top" alt="OpenCode" src="../packages/ui/src/assets/icons/preset-icons/opencode.svg" /></picture> &nbsp;[OpenCode](https://github.com/opencode-ai/opencode) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/pi-white.svg" /><img height="16" align="top" alt="Pi" src="../packages/ui/src/assets/icons/preset-icons/pi.svg" /></picture> &nbsp;[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | 完全対応 |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../packages/ui/src/assets/icons/preset-icons/polygraph-white.svg" /><img height="16" align="top" alt="Polygraph" src="../packages/ui/src/assets/icons/preset-icons/polygraph.svg" /></picture> &nbsp;[Polygraph](https://trypolygraph.com/) | 完全対応 |
| その他のCLIエージェント | 設定不要で動作 |

ターミナルで動くものなら、Supersetでも動きます

エージェントが得られるのはターミナルだけではありません:

- **モデルピッカー**: エージェント起動時にモデルと推論の強度を選択できます
- **エージェントごとの設定**: 起動コマンド、プロンプトテンプレート、モデルの上書きを設定 → エージェントで調整できます
- **カスタムエージェント**: 任意のターミナルエージェントを独自のアイコン付きで追加すれば、内蔵エージェントと同じように動作します
- **ステータスと通知**: 作業中インジケーター、完了チャイム、エージェントが対応を必要とするときのDockバッジ
- **内蔵チャット**: チャットペインでモデルと対話。インラインのツール承認とプランレビュー付きです

## デスクトップアプリだけではありません

すべてのサーフェスが同じワークスペースにつながっているため、アプリでタスクを開始してどこからでも確認できます。

| サーフェス | できること |
|:--------|:-------------|
| [**デスクトップアプリ**](https://github.com/superset-sh/superset/releases/latest) | フル機能のIDE:ターミナル、差分ビューア、アプリ内ブラウザ、オートメーション |
| [**CLI**](https://docs.superset.sh/cli/getting-started) | ワークスペース、エージェント、ターミナル、ホストをあらゆるシェルから管理できる単一の `superset` バイナリ |
| [**TypeScript SDK**](https://docs.superset.sh/sdk/getting-started) | [`@superset_sh/sdk`](https://www.npmjs.com/package/@superset_sh/sdk)を使ってNode、Bun、DenoからSupersetをプログラムで操作 |
| [**MCPサーバー**](https://docs.superset.sh/mcp) | Claude Code、Codex、Cursorなどのエージェント自身にワークスペースを作成・管理させる |

CLIはデスクトップアプリに同梱されていますが、単体でもインストールできます:

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
# or
brew install superset-sh/tap/superset
```

iOSアプリも近日公開予定です。スマートフォンからエージェントを確認できるようになります。

## インストール

デスクトップアプリをダウンロード:

- **macOS**: [Apple Silicon (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-arm64.dmg) · [Intel (.dmg)](https://github.com/superset-sh/superset/releases/latest/download/Superset-x64.dmg)
- **Linux**: [x64 AppImage](https://github.com/superset-sh/superset/releases/latest/download/Superset-x86_64.AppImage)(実験的。macOSが主要ターゲットです)
- **Windows**: 現時点では未対応
- [すべてのビルド](https://github.com/superset-sh/superset/releases/latest)

必要なのは[Git](https://git-scm.com/)だけです。[gh](https://cli.github.com/)は任意ですが、インストールするとPRワークフローが使えるようになります。Supersetが代わりにインストールを提案してくれます。

## 開発

Supersetをいじってみたい、またはPRを送りたいですか?リポジトリをクローンし、インストール済みのSupersetアプリに追加して、変更用のワークスペースを作成してください:

```bash
git clone https://github.com/superset-sh/superset.git
```

次に、そのワークスペースのターミナルから開発セットアップを実行します:

```bash
./.superset/setup.local.sh
bun run dev
```

`setup.local.sh` は新しいworktreeごとに1回実行してください。ワークスペース固有のアプリIDとポートを設定するため、開発版のデスクトップアプリをインストール済みのSupersetアプリや他の開発用worktreeと並行して実行できます。

Neonアカウントやサードパーティの認証情報は不要です。`setup.local.sh` がDocker経由でローカルのPostgres + Electricスタックを立ち上げ、開発用アカウントをシードします。**「Sign in as dev」**ボタン(または `admin@local.test` / `supersetdev`)でサインインしてください。

前提条件: [Bun](https://bun.sh/) v1.3.14+(`.bun-version` で固定)、`docker`、`jq`、`caddy`。`caddy` は `bun dev` がローカルHTTPSプロキシとして実行します(`brew install jq caddy && caddy trust`)。

完全なガイドは[**DEVELOPMENT.md**](../DEVELOPMENT.md)を参照してください:セットアップスクリプトの内容、実サービスに対する手動セットアップ、よく使うコマンド、トラブルシューティング、デスクトップアプリのビルド方法を説明しています。コントリビューションの手順は[**CONTRIBUTING.md**](../CONTRIBUTING.md)にあります。

## 設定

ワークスペースのセットアップ、ティアダウン、実行スクリプトは `.superset/config.json` で設定します。[完全なドキュメント](https://docs.superset.sh/setup-teardown-scripts)を参照してください。

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["./.superset/run.sh"]
}
```

キーボードショートカットは**設定 → キーボードショートカット**(⌘/)でカスタマイズできます。[ショートカット一覧](https://docs.superset.sh/keyboard-shortcuts)も参照してください。

## 技術スタック

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

## デフォルトでプライベート

- **ソース公開**: 全ソースコードはElastic License 2.0(ELv2)の下でGitHubに公開されています。
- **明示的な接続**: どのエージェント、プロバイダー、インテグレーションを接続するかは、あなた自身が選択します。

## コントリビューション

コントリビューションを歓迎します!環境構築とPRの作成方法は[CONTRIBUTING.md](../CONTRIBUTING.md)を参照してください。バグ報告や機能リクエストは[issues](https://github.com/superset-sh/superset/issues)へお願いします。

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## コミュニティ

Supersetコミュニティに参加して、サポートを受けたり、フィードバックを共有したり、他のユーザーとつながりましょう:

- **[Discord](https://discord.gg/cZeD9WYcV7)**: チームやコミュニティとチャット
- **[Twitter](https://x.com/superset_sh)**: 最新情報とお知らせをフォロー
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)**: バグ報告と機能リクエスト
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)**: 質問やアイデアの共有

### チーム

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## ライセンスと永久無料の範囲

**デスクトップアプリは永久に無料です。**自分のマシンでエージェントを並列実行することに、料金がかかることは決してありません。課金があるとしても、その上に載るオプションサービスだけです。

アプリ全体がこのリポジトリに[Elastic License 2.0](../LICENSE.md)の下で公開されています:使う、フォークする、改変する、チームでセルフホストする、すべて自由です。唯一できないのは、Superset自体をサービスとして再パッケージし、他者に販売することだけです。
