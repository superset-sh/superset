# Memory tab — edit each agent's memory in-app

## What

A new top-level dashboard tab, **Memory**, that shows what each coding agent
remembers on this machine and lets the user edit it with the existing TipTap
markdown editor. Three columns: agents → files → editor. Per agent it covers:

- the **global** instruction file (Claude Code's `~/.claude/CLAUDE.md`, Codex's
  `~/.codex/AGENTS.md`, Gemini's `GEMINI.md`, opencode's `AGENTS.md`);
- the **per-project instruction file** at each host project's repo root
  (resolved through the projects table's `repoPath`), listed where it exists;
- **per-workspace scopes** from the workspaces table: a worktree's
  instruction file appears **only when it diverges from the main checkout's
  copy** (the committed file exists in every worktree — listing hundreds of
  identical branch copies would bury the real memory), and project-less
  session workspaces get their own groups (instruction file + notes);
- Claude Code's **auto-memory notes** per project and per workspace cwd
  (`<configDir>/projects/<sanitized-path>/memory/*.md`, `MEMORY.md` pinned
  first — the sanitize rule is non-alphanumerics → `-`, verified against real
  dirs).

The agent rail shows a total memory-file count per agent, so a machine with
one empty global file but hundreds of project notes reads as what it is.

## Why not reuse `filesystem.readFile/writeFile`

The workspace filesystem router is hard-scoped to a worktree root
(`workspace-fs` rejects escapes) and must stay that way. Instead the host
service gets a narrow, **agent-keyed** surface — the renderer names an agent,
never a path — copying the shape of the desktop `plugins.getSkillContent`/
`writeSkillContent` pair (the in-app SKILL.md editor).

## Pieces

### Host service (`packages/host-service`)

- `trpc/router/agent-memory/registry.ts` — `AGENT_MEMORY_FILES`, a partial
  opt-in table like `SLASH_COMMAND_DISCOVERY`: `{ presetId, fileName,
  resolveConfigDir(env, homeDir) }`. Claude honors `CLAUDE_CONFIG_DIR`, Codex
  `CODEX_HOME`, opencode `XDG_CONFIG_HOME` — same env resolution the launch
  path uses, so the editor reads the file the CLI actually loads (multi-account
  profiles included).
- `trpc/router/agent-memory/agent-memory.ts` — router with:
  - `list` — every registry entry with the global file's stats plus a
    `fileCount` aggregated across global + project + auto-memory scopes.
  - `listFiles({ agent })` — the file tree for one agent: global (always, so
    it's creatable), then per project the repo instruction file and
    auto-memory notes, listed only where they exist.
  - `get({ agent, target })` / `write({ agent, target, content,
    expectedRevision })` — `target` is a discriminated union (`global` |
    `project` | `auto-memory` | `workspace` | `workspace-auto-memory`),
    agent-, project-, and workspace-keyed, never path-keyed; auto-memory file
    names are validated as plain note names (no separators, no leading dot)
    with a containment check behind the schema.
    Writes are optimistic-concurrency (sha256 revision; `null` = must still be
    absent; mismatch → `CONFLICT`).
- Registered as `agentMemory` in `trpc/router/router.ts`; types exported via
  the `@superset/host-service/agent-memory` subpath.

### Desktop renderer (`apps/desktop`)

- New route dir `routes/_authenticated/_dashboard/memory/` — `layout.tsx`
  (drag strip + scroll reset, same as plugins) and `page.tsx` (feature-flag
  gate with dev bypass, `?agent=` search param for deep links).
- `MemoryView` — three columns: `MemoryAgentList` (rail with per-agent file
  counts) + `MemoryFileList` (grouped Global / per-project files) +
  `MemoryEditor`. Host = active local host from `useLocalHostService`, same as
  Settings → Agents. Labels come from the host's agent configs when present,
  else `HOST_AGENT_PRESETS`.
- `MemoryEditor` — `TipTapMarkdownRenderer` with `editable` +
  `preserveSourceFormatting`, front matter split out verbatim
  (`splitFrontMatter`), Save button + Mod-S, dirty tracking against the loaded
  revision. Clean editors adopt external changes on focus refetch (agents
  rewrite these files mid-session); dirty editors keep the draft and surface
  `CONFLICT` on save with a Reload action.
- Sidebar buttons (collapsed rail + expanded list) and the
  `onDashboardViewRoute` predicate line in `_dashboard/layout.tsx`, gated like
  Plugins: `FEATURE_FLAGS.MEMORY` or dev build.
- `AgentIcon` promoted from `settings/agents/components/V2AgentsSettings/...`
  to `renderer/components/AgentIcon` — the Memory tab is its first consumer
  outside settings.

### Shared

- `FEATURE_FLAGS.MEMORY: "memory"` in `packages/shared/src/constants.ts`.

## Decisions

1. **Agent-keyed host endpoint, not a path-keyed one** — no arbitrary home-dir
   read/write surface from the renderer.
2. **Registry is opt-in** — an agent absent from `AGENT_MEMORY_FILES` simply
   doesn't appear in the tab. Adding one later is one registry line. Amp is
   left out of v1 pending verification of its global agent-file location.
3. **No localStorage** — selection persists via the `?agent=` search param.
4. **No command-palette entry in v1** — the navigation module has no per-tab
   entries for flagged tabs on main; add one when the flag ramps.
5. **Ship behind `memory` PostHog flag**, dev builds bypass (Plugins pattern).

## Later

- Creating a new auto-memory note or a missing project instruction file from
  the UI (today only existing files are listed; global is always creatable).
- Raw-markdown (CodeMirror) toggle, reusing the FilePane `CodeView` once the
  file-document store supports non-workspace backends.
- "Edit memory" deep link from Settings → Agents → `AgentDetail`.
- Search/filter across memory files (276 notes in one group wants a filter).
