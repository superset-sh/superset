# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

The developer just ran `trellis init` on this project for the first time.
`.trellis/` now exists with empty spec scaffolding, and this bootstrap task
exists under `.trellis/tasks/`. When they want to work on it, they should start
this task from a session that provides Trellis session identity.

**Your job**: help them populate `.trellis/spec/` with the team's real
coding conventions. Every future AI session — this project's
`trellis-implement` and `trellis-check` sub-agents — auto-loads spec files
listed in per-task jsonl manifests. Empty spec = sub-agents write generic
code. Real spec = sub-agents match the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

- [x] Fill guidelines for @superset/auth
- [x] Fill guidelines for @superset/chat
- [x] Fill guidelines for @superset/cli
- [x] Fill guidelines for @superset/cli-framework
- [x] Fill guidelines for @superset/db
- [x] Fill guidelines for @superset/email
- [x] Fill guidelines for @superset/host-service
- [x] Fill guidelines for @superset/local-db
- [x] Fill guidelines for @superset/macos-process-metrics
- [x] Fill guidelines for @superset/mcp
- [x] Fill guidelines for @superset/mcp-v2
- [x] Fill guidelines for @superset/panes
- [x] Fill guidelines for @superset/port-scanner
- [x] Fill guidelines for @superset/pty-daemon
- [x] Fill guidelines for @superset/sdk
- [x] Fill guidelines for @superset/shared
- [x] Fill guidelines for @superset/trpc
- [x] Fill guidelines for @superset/ui
- [x] Fill guidelines for @superset/workspace-client
- [x] Fill guidelines for @superset/workspace-fs
- [x] Fill guidelines for @superset/admin
- [x] Fill guidelines for @superset/api
- [x] Fill guidelines for @superset/desktop
- [x] Fill guidelines for @superset/docs
- [x] Fill guidelines for electric-proxy
- [x] Fill guidelines for @superset/marketing
- [x] Fill guidelines for @superset/mobile
- [x] Fill guidelines for @superset/relay
- [x] Fill guidelines for streams
- [x] Fill guidelines for @superset/web
- [x] Fill guidelines for @superset/typescript
- [x] Add code examples

---

## Spec files to populate

### Package: @superset/auth (`spec/auth/`)

- Backend guidelines: `.trellis/spec/auth/backend/`

- Frontend guidelines: `.trellis/spec/auth/frontend/`

### Package: @superset/chat (`spec/chat/`)

- Backend guidelines: `.trellis/spec/chat/backend/`

- Frontend guidelines: `.trellis/spec/chat/frontend/`

### Package: @superset/cli (`spec/cli/`)

- Frontend guidelines: `.trellis/spec/cli/frontend/`

### Package: @superset/cli-framework (`spec/cli-framework/`)

- Backend guidelines: `.trellis/spec/cli-framework/backend/`

- Frontend guidelines: `.trellis/spec/cli-framework/frontend/`

### Package: @superset/db (`spec/db/`)

- Backend guidelines: `.trellis/spec/db/backend/`

- Frontend guidelines: `.trellis/spec/db/frontend/`

### Package: @superset/email (`spec/email/`)

- Frontend guidelines: `.trellis/spec/email/frontend/`

### Package: @superset/host-service (`spec/host-service/`)

- Backend guidelines: `.trellis/spec/host-service/backend/`

- Frontend guidelines: `.trellis/spec/host-service/frontend/`

### Package: @superset/local-db (`spec/local-db/`)

- Backend guidelines: `.trellis/spec/local-db/backend/`

- Frontend guidelines: `.trellis/spec/local-db/frontend/`

### Package: @superset/macos-process-metrics (`spec/macos-process-metrics/`)

- Frontend guidelines: `.trellis/spec/macos-process-metrics/frontend/`

### Package: @superset/mcp (`spec/mcp/`)

- Backend guidelines: `.trellis/spec/mcp/backend/`

- Frontend guidelines: `.trellis/spec/mcp/frontend/`

### Package: @superset/mcp-v2 (`spec/mcp-v2/`)

- Backend guidelines: `.trellis/spec/mcp-v2/backend/`

- Frontend guidelines: `.trellis/spec/mcp-v2/frontend/`

### Package: @superset/panes (`spec/panes/`)

- Backend guidelines: `.trellis/spec/panes/backend/`

- Frontend guidelines: `.trellis/spec/panes/frontend/`

### Package: @superset/port-scanner (`spec/port-scanner/`)

- Backend guidelines: `.trellis/spec/port-scanner/backend/`

- Frontend guidelines: `.trellis/spec/port-scanner/frontend/`

### Package: @superset/pty-daemon (`spec/pty-daemon/`)

- Backend guidelines: `.trellis/spec/pty-daemon/backend/`

- Frontend guidelines: `.trellis/spec/pty-daemon/frontend/`

### Package: @superset/sdk (`spec/sdk/`)

- Backend guidelines: `.trellis/spec/sdk/backend/`

- Frontend guidelines: `.trellis/spec/sdk/frontend/`

### Package: @superset/shared (`spec/shared/`)

- Frontend guidelines: `.trellis/spec/shared/frontend/`

### Package: @superset/trpc (`spec/trpc/`)

- Backend guidelines: `.trellis/spec/trpc/backend/`

- Frontend guidelines: `.trellis/spec/trpc/frontend/`

### Package: @superset/ui (`spec/ui/`)

- Frontend guidelines: `.trellis/spec/ui/frontend/`

### Package: @superset/workspace-client (`spec/workspace-client/`)

- Backend guidelines: `.trellis/spec/workspace-client/backend/`

- Frontend guidelines: `.trellis/spec/workspace-client/frontend/`

### Package: @superset/workspace-fs (`spec/workspace-fs/`)

- Backend guidelines: `.trellis/spec/workspace-fs/backend/`

- Frontend guidelines: `.trellis/spec/workspace-fs/frontend/`

### Package: @superset/admin (`spec/admin/`)

- Frontend guidelines: `.trellis/spec/admin/frontend/`

### Package: @superset/api (`spec/api/`)

- Frontend guidelines: `.trellis/spec/api/frontend/`

### Package: @superset/desktop (`spec/desktop/`)

- Backend guidelines: `.trellis/spec/desktop/backend/`

- Frontend guidelines: `.trellis/spec/desktop/frontend/`

### Package: @superset/docs (`spec/docs/`)

- Frontend guidelines: `.trellis/spec/docs/frontend/`

### Package: electric-proxy (`spec/electric-proxy/`)

- Backend guidelines: `.trellis/spec/electric-proxy/backend/`

- Frontend guidelines: `.trellis/spec/electric-proxy/frontend/`

### Package: @superset/marketing (`spec/marketing/`)

- Frontend guidelines: `.trellis/spec/marketing/frontend/`

### Package: @superset/mobile (`spec/mobile/`)

- Frontend guidelines: `.trellis/spec/mobile/frontend/`

### Package: @superset/relay (`spec/relay/`)

- Backend guidelines: `.trellis/spec/relay/backend/`

- Frontend guidelines: `.trellis/spec/relay/frontend/`

### Package: streams (`spec/streams/`)

- Frontend guidelines: `.trellis/spec/streams/frontend/`

### Package: @superset/web (`spec/web/`)

- Frontend guidelines: `.trellis/spec/web/frontend/`

### Package: @superset/typescript (`spec/typescript/`)

- Frontend guidelines: `.trellis/spec/typescript/frontend/`


### Thinking guides (already populated)

`.trellis/spec/guides/` contains general thinking guides pre-filled with
best practices. Customize only if something clearly doesn't fit this project.

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching `.trellis/spec/` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every AI coding task spawns two sub-agents: `trellis-implement` (writes
  code) and `trellis-check` (verifies quality).
- Each task has `implement.jsonl` / `check.jsonl` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's `prd.md`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: `.trellis/spec/`. That's why filling it well now pays
  off forever.

---

## Completion

When the developer confirms the checklist items above are done with real
examples backed by real source paths, guide them to run:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

After archive, every new developer who joins this project will get a
`00-join-<slug>` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to Trellis! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"


## Bootstrap Notes

- Imported root repo rules from `AGENTS.md`.
- Imported desktop-specific rules from `apps/desktop/AGENTS.md`.
- Imported mobile routing/screen split from `apps/mobile/AGENTS.md`.
- Added repo-wide Trellis guides under `.trellis/spec/guides/` for monorepo, frontend, backend/tRPC, desktop, quality, reuse, and cross-layer work.
- Replaced generated scaffold package specs with concrete package roles, rules, and path examples.
