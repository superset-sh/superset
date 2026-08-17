# Superset Monorepo

Superset is an agent-first development platform, with an Electron desktop IDE, Next.js web apps, and an Expo mobile app as the main customer-facing surfaces. It's a Turborepo monorepo, deployed apps are in apps/ and supporting packages are in packages/, and we use tRPC for the api.

You're working inside a Superset workspace, an isolated git-worktree copy of this repo. "Workspace" in a user message means that, not an editor workspace.

## Project Structure

All projects in this repo should be structured like this:

```
app/
├── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── components/
│   │   └── MetricsChart/
│   │       ├── MetricsChart.tsx
│   │       ├── MetricsChart.test.tsx      # Tests co-located
│   │       ├── index.ts
│   │       └── constants.ts
│   ├── hooks/                             # Hooks used only in dashboard
│   │   └── useMetrics/
│   │       ├── useMetrics.ts
│   │       ├── useMetrics.test.ts
│   │       └── index.ts
│   ├── utils/                             # Utils used only in dashboard
│   │   └── formatData/
│   │       ├── formatData.ts
│   │       ├── formatData.test.ts
│   │       └── index.ts
│   ├── stores/                            # Stores used only in dashboard
│   │   └── dashboardStore/
│   │       ├── dashboardStore.ts
│   │       └── index.ts
│   └── providers/                         # Providers for dashboard context
│       └── DashboardProvider/
│           ├── DashboardProvider.tsx
│           └── index.ts
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx
    │   ├── Sidebar.test.tsx               # Tests co-located
    │   ├── index.ts
    │   ├── components/                    # Used 2+ times IN Sidebar
    │   │   └── SidebarButton/             # Shared by SidebarNav + SidebarFooter
    │   │       ├── SidebarButton.tsx
    │   │       ├── SidebarButton.test.tsx
    │   │       └── index.ts
    │   ├── SidebarNav/
    │   │   ├── SidebarNav.tsx
    │   │   └── index.ts
    │   └── SidebarFooter/
    │       ├── SidebarFooter.tsx
    │       └── index.ts
    └── HeroSection/
        ├── HeroSection.tsx
        ├── HeroSection.test.tsx           # Tests co-located
        ├── index.ts
        └── components/                    # Used ONLY by HeroSection
            └── HeroCanvas/
                ├── HeroCanvas.tsx
                ├── HeroCanvas.test.tsx
                ├── HeroCanvas.stories.tsx
                ├── index.ts
                └── config.ts

components/                                # Used in 2+ pages (last resort)
└── Header/
```

1. **One folder per component**: `ComponentName/ComponentName.tsx` + `index.ts` for barrel export
2. **Co-locate by usage**: If used once, nest under parent's `components/`. If used 2+ times, promote to **highest shared parent's** `components/` (or `components/` as last resort)
3. **One component per file**: No multi-component files
4. **Co-locate dependencies**: Utils, hooks, constants, config, tests, stories live next to the file using them

### Exception: shadcn/ui Components

The `src/components/ui/` and `src/components/ai-elements` directories contain shadcn/ui components. These use **kebab-case single files** (e.g., `button.tsx`, `base-node.tsx`) instead of the folder structure above. This is intentional—shadcn CLI expects this format for updates via `bunx shadcn@latest add`.

## Database

Drizzle ORM, schema in `packages/db/src/`. Follow `.agents/skills/db-migrations/SKILL.md` to generate
migrations. Never hand-edit `packages/db/drizzle/` (SQL, `meta/_journal.json`, snapshots) without
explicit user confirmation, and never apply migrations against a shared or production database.

## Releases

Desktop, host-service, and cli share one version; cut releases on a dedicated branch. Runbook:
`scripts/release/README.md`. A *canary* is a separate thing: `bash scripts/release-canary.sh
[commit]` builds the rolling internal `desktop-canary` prerelease, not a versioned release.

## Orchestrating agents and workspaces

When work wants a fresh isolated environment, a parallel agent, or a long-running job, reach for the
`superset` CLI instead of hand-rolling git worktrees or doing it all serially in this one. It's
already on `PATH` in Superset terminals, and we dogfood it.

Replace the capitalized placeholders before running these:

```bash
superset ws create --project PROJECT_ID --branch BRANCH --agent claude --prompt "..."
superset agents create --workspace WORKSPACE_ID --agent claude --prompt "..."
superset ws list
superset terminals read --workspace WORKSPACE_ID --terminal TERMINAL_ID
superset ws delete WORKSPACE_ID
```

In order: an isolated workspace with an agent already working in it, another agent in an existing
workspace, what's running, what an agent is doing right now, and cleanup when you're done.

`superset <command> --help` covers the rest (tasks, automations, hosts, settings). Pass `--json` for
parsable output; it's on by default under agent environments.

## Further reading

- `.agents/skills/`: CDP UI verification, DB migrations, ticket format, and more. Read the matching
  `SKILL.md` when a task fits its description.
- `docs/agent-tooling.md`: where commands, skills, and per-agent-CLI config live.
- `apps/desktop/AGENTS.md`: desktop specifics (notices, persisted renderer state).
- `apps/mobile/AGENTS.md`: mobile structure and iOS-only scope.
- `docs/cloud-sandbox-mismatches.md`: where cloud workspace sandboxes don't fit assumptions the
  app makes about a machine someone owns. Read it before touching sandboxes, and add to it when
  you find a new one.
- `docs/cloud-sandbox-considerations.md`: what cloud sandboxes still owe before they leave the
  team — billing, credential blast radius, untested behaviour.
