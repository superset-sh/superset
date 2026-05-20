<div align="center">

<img width="full" alt="Superset" src="apps/marketing/public/images/readme-hero.png" />

### Run dozens of coding agents in parallel.

A native macOS app that gives every agent its own git worktree, terminal, and review surface — with notifications when they need you.

[![GitHub stars](https://img.shields.io/github/stars/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/superset-sh/superset?style=flat&logo=github)](https://github.com/superset-sh/superset/releases)
[![License](https://img.shields.io/github/license/superset-sh/superset?style=flat)](LICENSE.md)
[![Twitter](https://img.shields.io/badge/@superset__sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)

<br />

[**Download for macOS**](https://github.com/superset-sh/superset/releases/latest) &nbsp;&bull;&nbsp; [Documentation](https://docs.superset.sh) &nbsp;&bull;&nbsp; [Changelog](https://github.com/superset-sh/superset/releases) &nbsp;&bull;&nbsp; [Discord](https://discord.gg/cZeD9WYcV7)

<br />

<!-- TODO: replace with real product screenshot of the main UI with multiple workspaces -->
<img width="900" alt="Superset main UI" src="apps/marketing/public/images/readme-hero.png" />

<a href="https://www.youtube.com/"><!-- TODO: replace with actual demo video URL -->▶ Watch the 90-second demo</a>

</div>

## About

Superset is a native macOS app for running many CLI-based coding agents in parallel. Each agent gets its own git worktree, terminal, and review surface, so agents can work on different branches at the same time without trampling each other or your main checkout. Notifications surface in one place — you stay in flow until something actually needs your attention.

Superset is built for developers who already run agents like Claude Code, Codex, and Cursor Agent from the terminal and want a faster way to orchestrate many of them at once. It works with any CLI agent.

## What Superset Does

| # | Pillar |
| :-: | --- |
| 1 | [Parallel agents in isolated git worktrees](#parallel-agents-in-isolated-git-worktrees) |
| 2 | [Notifications when agents need you](#notifications-when-agents-need-you) |
| 3 | [Built-in diff review and inline editing](#built-in-diff-review-and-inline-editing) |
| 4 | [Reproducible workspace setup](#reproducible-workspace-setup) |
| 5 | [Universal CLI-agent compatibility](#universal-cli-agent-compatibility) |

#### Parallel agents in isolated git worktrees

Superset runs each task in its own git worktree off the same repository. Workspaces share the underlying object store but have independent working directories and branches, so agents can edit files, install dependencies, and run tests without touching each other or your main checkout.

You can spin up ten workspaces from a single project and have ten agents working on ten different branches simultaneously. When a workspace is done, its branch goes through the same review and merge flow you already use.

#### Notifications when agents need you

Long-running agents alternate between heads-down work and questions for the user. Superset watches every workspace and pings you the moment an agent stops to ask something or finishes a task. The notification list lives in the sidebar so you can scan the state of every workspace at a glance, jump to whichever one needs you, and ignore the ones still working.

This is the difference between checking on agents every few minutes and letting them tell you when they need you.

#### Built-in diff review and inline editing

Every workspace ships with a diff view that shows uncommitted changes, staged changes, and the agent's most recent turn. You can edit files in place, stage hunks, and commit without leaving the app or switching to an external editor.

When you want a full IDE, one click hands the workspace off to VS Code, Cursor, Zed, or your terminal — the worktree path is the same path your editor opens.

#### Reproducible workspace setup

A `.superset/config.json` at your repo root defines what should happen when a workspace is created or destroyed — copy `.env`, install dependencies, run migrations, tear down branches, and anything else you'd normally do by hand. New workspaces come up identical to your main checkout in seconds. See the [setup/teardown docs](https://docs.superset.sh/setup-teardown-scripts).

#### Universal CLI-agent compatibility

Superset works with any agent that runs in a terminal. Claude Code, Codex, Cursor Agent, Gemini, Copilot CLI, OpenCode, Amp, and Pi all work without per-agent configuration. If it talks to stdin/stdout, Superset can run it.

## Supported Agents

| Agent | Status |
|:------|:-------|
| [Amp Code](https://ampcode.com/) | Fully supported |
| [Claude Code](https://github.com/anthropics/claude-code) | Fully supported |
| [OpenAI Codex CLI](https://github.com/openai/codex) | Fully supported |
| [Cursor Agent](https://docs.cursor.com/agent) | Fully supported |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Fully supported |
| [GitHub Copilot](https://github.com/features/copilot) | Fully supported |
| [OpenCode](https://github.com/opencode-ai/opencode) | Fully supported |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | Fully supported |
| Any CLI agent | Will work |

If it runs in a terminal, it runs on Superset.

## Requirements

| Requirement | Details |
|:------------|:--------|
| **OS** | macOS (Windows/Linux untested) |
| **Runtime** | [Bun](https://bun.sh/) v1.0+ |
| **Version Control** | Git 2.20+ |
| **GitHub CLI** | [gh](https://cli.github.com/) |
| **Caddy** | [caddy](https://caddyserver.com/docs/install) (for dev server) |

## Getting Started

**[Download Superset for macOS](https://github.com/superset-sh/superset/releases/latest)**

<details>
<summary>Or build from source</summary>

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

# Without this, Chromium rejects https://localhost:* with ERR_CERT_AUTHORITY_INVALID.
# Prompts for sudo once.
caddy trust
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

## Configuration

Configure workspace setup, teardown, and presets in `.superset/config.json`. See the [configuration docs](https://docs.superset.sh/setup-teardown-scripts).

## Keyboard Shortcuts

All shortcuts are customizable via **Settings > Keyboard Shortcuts** (`⌘/`). See the [full shortcut reference](https://docs.superset.sh/keyboard-shortcuts).

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

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and the PR workflow. For bugs or feature requests, [open an issue](https://github.com/superset-sh/superset/issues).

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Community

- **[Discord](https://discord.gg/cZeD9WYcV7)** — Chat with the team and community
- **[Twitter](https://x.com/superset_sh)** — Follow for updates and announcements
- **[GitHub Issues](https://github.com/superset-sh/superset/issues)** — Report bugs and request features
- **[GitHub Discussions](https://github.com/superset-sh/superset/discussions)** — Ask questions and share ideas

### Team

[![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
[![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
[![Satya Twitter](https://img.shields.io/badge/Satya-@saddle__paddle-555?logo=x)](https://x.com/saddle_paddle)

## License

Distributed under the Elastic License 2.0 (ELv2) — source is available on GitHub; you choose which agents, providers, and integrations to connect. See [LICENSE.md](LICENSE.md) for full terms.
