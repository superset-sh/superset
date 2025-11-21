# Superset

A modern monorepo for Superset - featuring a website, desktop app, docs, and blog.

## Quick Start

```bash
# Install dependencies
bun install

# Start development servers
bun dev

# Run tests
bun test
```

## Tech Stack

- **Package Manager**: Bun
- **Build System**: Turborepo
- **Database**: Drizzle ORM + Neon PostgreSQL
- **UI**: React + TailwindCSS v4 + shadcn/ui
- **Code Quality**: Biome (formatting + linting)

## Project Structure

```
apps/
├── website/          # Main website application
├── desktop/          # Electron desktop app
├── cli/              # Command-line interface for managing workspaces & agents
├── docs/             # Documentation site
└── blog/             # Blog site

packages/
├── ui/               # Shared UI components (shadcn/ui)
├── db/               # Drizzle ORM database schema
├── constants/        # Shared constants
├── models/           # Shared data models
├── scripts/          # CLI tooling
└── typescript-config/ # TypeScript configurations
```

## Development

### Common Commands

```bash
# Development
bun dev                    # Start all dev servers
bun test                   # Run tests
bun build                  # Build all packages

# Code Quality
bun run lint               # Format + lint + fix auto-fixable issues
bun run lint:check         # Check only (no changes, for CI)
bun run format             # Format code only
bun run format:check       # Check formatting only (CI)
bun run typecheck          # Type check all packages

# Database
bun run db:push            # Apply schema changes
bun run db:seed            # Seed database
bun run db:migrate         # Run migrations
bun run db:studio          # Open Drizzle Studio

# Maintenance
bun run clean              # Clean root node_modules
bun run clean:workspaces   # Clean all workspace node_modules
```

### Adding UI Components

```bash
cd packages/ui
npx shadcn@latest add <component>
```

## Code Quality

This project uses Biome for formatting and linting (configured at root level):

- **Format + Lint**: `bun run lint` - Automatically fixes issues
- **Check Only**: `bun run lint:check` - Validates without changes (CI)

## Database

Schema is defined in `packages/db/src/` using Drizzle ORM.

### Migrations

1. Spin up a new Neon branch for migrations
2. Update root `.env` to point at the Neon branch
3. Modify Drizzle schema in `packages/db/src/schema`
4. Generate migration: `pnpm drizzle-kit generate --name="migration_name_snake_case"`

**Neon Details:**
- Org ID: `org-round-base-25422821`
- Project ID: `tiny-cherry-82420694`

## CLI Tool

The CLI (`apps/cli`) provides terminal-based management of workspaces and agents:

### Features

- **Workspace Management**: List, create, and switch between workspaces
- **Agent Monitoring**: Track running agents with real-time status updates
- **Interactive Panels**: Navigate workspaces and agents with keyboard shortcuts
- **Process Orchestration**: Manage agent lifecycle (start, stop, attach)

### Usage

```bash
# View all commands
superset --help

# Interactive panels view
superset panels

# Dashboard view
superset dashboard

# Agent management
superset agent list
superset agent attach <agent-id>
```

### Requirements

- Node.js >=20 (required by string-width dependency)

## Desktop App

The desktop app (`apps/desktop`) is built with Electron and features:

- Type-safe IPC communication
- Terminal management with node-pty
- Git worktree-based workspace management

See `apps/desktop/docs/TYPE_SAFE_IPC.md` for IPC documentation.

## Contributing

1. Keep diffs minimal and targeted
2. Follow existing code patterns
3. Maintain type safety (avoid `any`)
4. Co-locate components by usage
5. Run `bun run lint` before committing

For detailed architecture guidelines, see `AGENTS.md`.