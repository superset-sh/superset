<div align="center">
<img width="600" alt="supersetlogo" src="https://github.com/user-attachments/assets/43c1bde8-93f5-4f53-9db4-187f632051a2" />

<h3 align="center">Superset</h3>
  <p align="center">
    Run 10+ parallel coding agents on your machine
  </p>

[![Twitter](https://img.shields.io/badge/@superset_sh-555?logo=x)](https://x.com/superset_sh)
[![Discord](https://img.shields.io/badge/Discord-555?logo=discord)](https://discord.gg/cZeD9WYcV7)
[![Docs](https://img.shields.io/badge/Docs-555?logo=gitbook&logoColor=white)](https://docs.superset.sh)

</div>

## A Desktop App for Parallel AI Coding

Run AI coding agents like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://openai.com/index/introducing-codex/), and more in isolated workspaces. Each workspace is a [git worktree](https://git-scm.com/docs/git-worktree) with its own branch, terminal, and ports. Work on multiple features simultaneously without conflicts.

https://github.com/user-attachments/assets/d85ec84f-34de-4e17-9d44-5ccbd225566f

## Features

### Workspaces
Each workspace is an isolated git worktree on its own branch. Create workspaces from new branches, existing branches, or pull requests.

<img width="700" alt="Workspaces" src="./apps/docs/public/images/branches.png" />

### AI Agents
Run Claude Code, Codex, or other CLI agents in separate workspaces. Compare results and merge the best solution.

<img width="700" alt="AI Agents" src="./apps/docs/public/images/agents.png" />

### Diff Viewer
Review changes, stage files, commit, and push—all from one interface. Create PRs directly from Superset.

<img width="700" alt="Diff Viewer" src="./apps/docs/public/images/changes.png" />

### Terminal
Built-in terminal with multiple tabs per workspace. Sessions persist across app restarts.

<img width="700" alt="Terminal" src="./apps/docs/public/images/terminal.png" />

### IDE Integration
Open any workspace in [Cursor](https://cursor.sh) or [VS Code](https://code.visualstudio.com) with a single click.

<img width="700" alt="IDE Integration" src="./apps/docs/public/images/open-in.png" />

### Port Management
View and manage active ports across all workspaces. Kill stale processes with one click.

<img width="700" alt="Ports" src="./apps/docs/public/images/ports.png" />

## Getting Started

### Requirements
- macOS (Apple Silicon or Intel)
- [Git](https://git-scm.com/) installed
- [GitHub CLI](https://cli.github.com/) authenticated (`gh auth status`)

### Development Setup

Clone the repo:
```bash
git clone https://github.com/superset-sh/superset.git
cd superset
```

Set up environment variables:
```bash
cp .env.example .env
# Edit .env and fill in values, or:
export SKIP_ENV_VALIDATION=1  # Skip validation for quick setup
```

Install and run:
```bash
bun install
bun run dev
```

Build the desktop app:
```bash
bun run build
open apps/desktop/release
```

> [!NOTE]
> While Electron is cross-platform, Superset has only been tested on **macOS**.

## Tech Stack

[![Electron](https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Vite](https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Biome](https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white)](https://biomejs.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Neon](https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white)](https://neon.tech/)
[![tRPC](https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white)](https://trpc.io/)

## Documentation

See the full documentation at [docs.superset.sh](https://docs.superset.sh):
- [Quick Start](https://docs.superset.sh/quick-start)
- [Your First Workspace](https://docs.superset.sh/first-workspace)
- [Setup Scripts](https://docs.superset.sh/setup-teardown-scripts)
- [Keyboard Shortcuts](https://docs.superset.sh/keyboard-shortcuts)
- [FAQ](https://docs.superset.sh/faq)

## Contributing

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also [open issues](https://github.com/superset-sh/superset/issues).

See the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions and code of conduct.

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Follow Us

- [![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
- [![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
- [![Satya Twitter](https://img.shields.io/badge/Satya-@saddle_paddle-555?logo=x)](https://x.com/saddle_paddle)

## License

Distributed under the Apache 2.0 License. See [LICENSE.md](LICENSE.md) for more information.
