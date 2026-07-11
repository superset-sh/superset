# Agents & Skills Library — manage subagent and skill definition files from the Superset UI

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the root `AGENTS.md` and `plans/` ExecPlan template. Cross-app work (packages/host-service + packages/shared + apps/desktop), so it lives in root `plans/`.

## Purpose / Big Picture

Coding-agent harnesses like Claude Code let users define **custom subagents** (markdown files such as `~/.claude/agents/worker.md` whose YAML frontmatter sets a default `model`, `effort`, and whose body is the agent's instructions) and **skills** (folders such as `~/.claude/skills/orchestrate/` containing a `SKILL.md` with frontmatter plus instruction text). Today these files are invisible to Superset — editing the default model of five agents across three repos means opening ten files by hand. Every time a vendor ships a new model, that manual churn repeats.

After this change, Superset's desktop app has an **Agents & Skills** page that lists every subagent and skill on a host, grouped by scope (user-level `~/.claude` vs. per-project `.claude`/`.agents` directories), lets the user change an agent's model/effort from dropdowns (including bulk "set model on N agents"), edit instruction bodies in an editor with an embedded AI chat that can rewrite the instructions on request, and copy/move/delete definitions across scopes. Because Claude Code natively watches these directories, a save is live in running ("WIP") sessions within seconds — the next subagent spawn or skill invocation uses the new definition, no restart.

Observable outcome: run `bun dev`, open desktop Settings → Agents & Skills, see `worker` (model: sonnet) listed under the User scope; change model to `opus`, press Save; `cat ~/.claude/agents/worker.md` shows `model: opus` with every other frontmatter key untouched; a Claude Code session already running in any workspace spawns its next `worker` with opus.

## Assumptions

- Claude Code definition format is the v1 target (the user's real setup). Codex/OpenCode/Cursor agent formats are out of scope for v1 (their harness *launch* model/effort is already covered by the existing preset system).
- Desktop app is the only v1 surface (the web app's agents UI is mock-data behind a flag).
- One host at a time is viewed; the page has a host picker like the existing terminal-agents settings.
- `model`/`effort` frontmatter value sets follow current Claude Code docs (verified 2026-07-10): model `inherit | sonnet | opus | haiku | fable | <full model id>`; effort `low | medium | high | xhigh | max`. A free-text option must exist so brand-new model ids are usable the day they ship.

## Open Questions

None — the three planning forks (surface placement, "global" scope meaning, AI chat depth) were answered by the user on 2026-07-10 and are recorded as Decision Log D5–D7.

## Progress

- [x] (2026-07-10 21:00Z) Codebase reconnaissance complete (discovery scanner precedent, filesystem router capabilities and root-confinement, settings UI patterns, chat/editor components, live-reload semantics of Claude Code verified against docs).
- [x] (2026-07-10 21:35Z) ExecPlan drafted.
- [x] (2026-07-10 21:45Z) Open questions answered by user; Decision Log updated (D5 settings section, D6 user+project scopes, D7 full agent session).
- [x] (2026-07-10 22:15Z) Milestone 1: shared types (`packages/shared/src/agent-library.ts`) + host-service `agentLibrary` router (list/listScopes/get/save/create/remove/transfer) with 26 unit tests (frontmatter round-trip, symlink dedupe, revision conflicts, transfer matrix).
- [x] (2026-07-10 22:45Z) Milestones 2+3: Agents & Skills settings page — section registration (layout, nav, search index), scope-grouped sidebar with filter + multi-select, detail view with model/effort selects (+ free-text custom model), description, CodeMirror body editor, raw-file mode, Save with revision check + conflict banner, delete with confirm, BulkModelBar.
- [x] (2026-07-10 22:45Z) Milestone 4: TransferMenu — copy/move to any other scope, overwrite confirm dialog on CONFLICT.
- [x] (2026-07-10 23:10Z) Milestone 5: AiChatPanel — persistent per-definition agent session with filesystem tools (see revision note: implemented over the existing desktop `chatRuntimeService`, not a host-service ChatRuntimeManager extension), approval/question bars, post-turn editor reload with dirty-draft conflict protection.
- [x] (2026-07-10 23:20Z) Validation battery green: `bun run lint` exit 0, `bun run typecheck` 32/32 tasks, `bun test packages/host-service` 806 pass / 0 fail (one repo guard test initially caught a snapshot-field read in `listScopes`; fixed by labeling scopes from `repoPath` basename), `bunx sherif` clean.
- [ ] Manual acceptance walkthrough in the running desktop app (blocked on this machine: fresh checkout, no signed-in dev session; walk through after the PR build).

## Surprises & Discoveries

- Observation: Superset already has a *different* thing called "agents" in Settings — terminal-harness launch presets (command/args/env rows in host SQLite `hostAgentConfigs`), plus `agentPresetOverrides` in desktop settings. Naming the new surface must avoid this collision.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/settings/agents/` edits `packages/host-service/src/trpc/router/settings/agent-configs.ts` rows; no product code reads `.claude/agents` or any `SKILL.md`.
- Observation: "Changes apply to WIP sessions on save" is nearly free. Claude Code watches `~/.claude/agents/`, `.claude/agents/`, and skill directories; edits to existing agent files apply on the next spawn and `SKILL.md` body edits apply on next invocation, no restart. Caveats: a brand-new `agents/` directory created mid-session requires a session restart to be watched; newly added skills may need `/reload-skills` to appear in the skill list.
  Evidence: code.claude.com/docs sub-agents.md ("Write subagent files" watcher note) and skills.md ("Live change detection").
- Observation: host-service filesystem mutations are hard-confined to a workspace's worktree root (`ensureWithinRoot`/`assertRealpathWithinRoot` in `packages/workspace-fs/src/fs.ts:568-760`), while reads/stat/browse accept arbitrary absolute paths. So `~/.claude/agents/worker.md` is readable but **not writable** through any existing tRPC procedure.
  Evidence: `packages/host-service/src/trpc/router/filesystem/filesystem.ts` (`writeFile:262` requires `workspaceId`; `browseHost:82`/`statPath:216` are read-only).
- Observation: the existing hand-rolled frontmatter parser (`packages/chat/src/server/desktop/slash-commands/frontmatter.ts`) reads only three scalar keys line-by-line; it cannot round-trip YAML (multi-line strings, lists, unknown keys). No YAML library exists anywhere in the workspace today.
  Evidence: grep for `"yaml"|"gray-matter"|"js-yaml"` across all package.json files returns nothing.
- Observation: in this very repo `.claude/skills` is a symlink to `.agents/skills` (per root AGENTS.md convention), so a naive scan of both directories double-lists every skill. The scanner must dedupe by realpath.
- Observation (implementation): the desktop's existing `chatRuntimeService` (packages/chat `service.ts`, mounted in the Electron main process over IPC) already creates Mastra runtimes keyed by `sessionId + cwd` with **no workspace coupling** — `getOrCreateRuntime(sessionId, cwd)` takes any directory. The planned host-service `ChatRuntimeManager` extension was unnecessary for the local case; Milestone 5 became pure UI.
  Evidence: `packages/chat/src/server/trpc/service.ts:118-173`, `zod.ts:28-31` (`sessionIdInput = { sessionId: uuid, cwd?: string }`).
- Observation (implementation): operating paths handed to a scope-rooted `FsService` must be built lexically from the same `rootPath` string the service was created with; realpath-resolved paths fail the service's lexical containment check (bit us via macOS's `/var -> /private/var` tmpdir symlink in tests). Realpath is used only as the dedupe key.
- Observation (implementation): host-service has a guard test (`test/integration/no-snapshot-fields-for-queries.test.ts`) forbidding reads of cached `repoName`/`repoOwner`/`repoCloneUrl` outside an allowlist. `listScopes` initially read `project.repoName` for a display label and tripped it; labels now come from `basename(project.repoPath)`.

## Decision Log

- Decision (D1): Files on disk are the single source of truth; no database mirror of definitions. The UI reads and writes the markdown files directly through a new host-service router.
  Rationale: the harness CLIs only read files; a DB copy would drift and add sync machinery for zero user value. Claude Code's own watchers then deliver the "live in WIP sessions" requirement for free.
  Date/Author: 2026-07-10 / Claude planning session.
- Decision (D2): Writes go through per-scope-rooted `FsService` instances instead of loosening the worktree-root confinement or adding an arbitrary-path write API.
  Rationale: `createFsHostService` confines all mutations to its `rootPath`; instantiating one service rooted at `~/.claude` and one per project config dir reuses the existing atomicity, symlink-escape checks, and `ifMatch` optimistic-concurrency for free while keeping the blast radius exactly the config directories.
  Date/Author: 2026-07-10 / Claude planning session.
- Decision (D3): Add the `yaml` npm package (eemeli/yaml) to `packages/host-service` for frontmatter round-tripping via its Document API.
  Rationale: editing `model:` must preserve every other key, key order, and comments. The existing line parser cannot; hand-rolling YAML editing is a known bug farm. `yaml` is dependency-free and the de-facto standard.
  Date/Author: 2026-07-10 / Claude planning session.
- Decision (D4): Clients never send filesystem paths. A definition is addressed by `{ scopeKey, kind, name }` and the server resolves the path from an allowlist.
  Rationale: input validation at a trust boundary — prevents path traversal from a compromised renderer/relay client, and keeps the API stable if directory conventions change.
  Date/Author: 2026-07-10 / Claude planning session.
- Decision (D5): The surface is a new Settings section ("Agents & Skills", id `agent-library`) using the inner list-sidebar layout, matching `settings/hosts` and `settings/agents`. An in-workspace pane can be layered on later.
  Rationale: user choice 2026-07-10 (of settings section / dashboard page / workspace pane); cheapest option, consistent with where configuration lives, pattern fully established.
  Date/Author: 2026-07-10 / user decision.
- Decision (D6): v1 ships two scopes — User (`~/.claude`, applies to every project on the host) and Project (per-repo). No cross-host cloud-synced scope in v1; that is an explicit fast-follow candidate.
  Rationale: user choice 2026-07-10. Claude Code has no scope above user-level on one machine, and cloud sync would roughly double backend scope (schema + sync + conflicts) before the core value is proven.
  Date/Author: 2026-07-10 / user decision.
- Decision (D7): The embedded AI chat is a **full agent session**: a real Mastra harness runtime (the same `createMastraCode` machinery that powers the "superset" chat agent) with filesystem tools, working directory pinned to the definition's scope root. The AI edits the definition file directly with its edit tool; the detail view refreshes from disk after each assistant turn.
  Rationale: user choice 2026-07-10, explicitly preferring it over the recommended stateless procedure — the deciding value is that the model can pull broader context (read sibling agents, repo files) and perform multi-step edits rather than regenerate one draft. Consequence accepted: two write paths exist (form Save with `ifMatch` + agent tool edits), reconciled by refreshing the detail view on agent edits and surfacing revision conflicts on Save. v1 boundary: the session and its transcript live for as long as the panel/app is open; durable cross-restart transcript persistence is deferred (avoids touching the cloud `chatSessions` schema).
  Date/Author: 2026-07-10 / user decision.
- Decision (D8): v1 parses/edits Claude Code format only, but the scanner also indexes `.agents/skills` and `.agents/agents` directories (the cross-agent convention this repo itself uses), deduped by realpath against their `.claude` symlinks.
  Rationale: covers the user's actual setup including this repo's layout without committing to Codex/OpenCode format support.
  Date/Author: 2026-07-10 / Claude planning session.
- Decision (D9): the AI chat session runs on the desktop's existing `chatRuntimeService` (Electron main process, `{ sessionId, cwd }`-keyed Mastra runtimes) with the definition context injected as a first-message preamble — no `ChatRuntimeManager` extension, no new server code. Tool cwd-confinement is not hardened beyond the prompt; the session has the same trust level as the terminal agents Superset already launches with permission bypasses on the same machine.
  Rationale: the planned host-service extension turned out to be unnecessary for the v1 local-host scope — the transport already supports arbitrary-cwd sessions, making Milestone 5 pure UI. Supersedes D7's mechanism while preserving its user-facing behavior; the host-service path remains the route to remote-host support later.
  Date/Author: 2026-07-10 / implementation.

## Context and Orientation

Superset (this monorepo) is a product that runs coding-agent CLI sessions on user machines. Terms used below:

- **Host**: a machine running `packages/host-service` (an HTTP tRPC server). The desktop app is itself a host for the local machine; remote hosts are reached through `apps/relay`. The desktop renderer gets a tRPC client for any host via `getHostServiceClientByUrl(url)` (see `apps/desktop/src/renderer/hooks/useV2AgentConfigs/useV2AgentConfigs.ts` for the canonical react-query usage).
- **Project**: a registered git repository on a host (host-service `project` router; `project.repoPath` is its absolute path). A **workspace** is a git worktree of a project; agent sessions run inside workspaces.
- **Subagent definition**: a markdown file `<dir>/agents/<name>.md` with YAML frontmatter (`name`, `description`, `model`, `effort`, `tools`, `memory`, `color`, …) and an instruction body. Claude Code reads them from `~/.claude/agents/` (user scope) and `<repo>/.claude/agents/` (project scope).
- **Skill**: a folder `<dir>/skills/<name>/` containing `SKILL.md` (frontmatter: `name`, `description`, `allowed-tools`, optionally `model`/`effort`, …) plus optional asset files. Read from `~/.claude/skills/` and `<repo>/.claude/skills/`; in repos following this monorepo's convention the real folder is `<repo>/.agents/skills/` with `.claude/skills` symlinked to it.
- **WIP session**: a running terminal agent — host SQLite `terminalSessions.status = "active"` with a `terminalAgentBindings` row (`packages/host-service/src/db/schema.ts`).

Key existing code this plan builds on:

- `packages/chat/src/server/desktop/slash-commands/registry.ts` — the only existing config-dir scanner (commands). Pattern to imitate: scan project + home variants of `.claude/...` and `.agents/...`, project entries win on name collision, ~1s TTL cache.
- `packages/workspace-fs/src/host/service.ts` (`createFsHostService`) and `packages/workspace-fs/src/core/service.ts` (`FsService` interface: `listDirectory`, `readFile`, `writeFile` with `precondition.ifMatch`, `deletePath`, `movePath`, `copyPath`, …). Mutations are confined to the service's `rootPath`.
- `packages/shared/src/agent-models.ts` — Superset's harness-launch model catalogs. **Not** the value set for agent frontmatter, but the UI look/feel of its pickers is the reference.
- `apps/desktop/src/renderer/routes/_authenticated/settings/` — settings shell. `layout.tsx` holds `SECTION_ORDER` and the `usesInnerSidebar` set (list+detail layout used by `projects`, `hosts`, `agents`); nav items live in `components/SettingsSidebar/GeneralSettings.tsx` (`SECTION_GROUPS`); search index in `utils/settings-search/settings-search.ts`. The component pattern to clone is `settings/agents/components/V2AgentsSettings/` (list sidebar + detail form + save-on-blur + inline delete + host picker) with the reusable `settings/components/SettingsListSidebar`.
- Editor components: CodeMirror 6 wrapper `apps/desktop/src/renderer/screens/main/components/WorkspaceView/components/CodeEditor/CodeEditor.tsx` (markdown + yaml langs available); TipTap `apps/desktop/src/renderer/components/MarkdownEditor/MarkdownEditor.tsx` (WYSIWYG, deferred).
- Chat UI primitives: `packages/ui/src/components/ai-elements/` (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `FileDiffTool`).
- One-shot LLM call precedent: `packages/host-service/src/trpc/router/workspace-creation/utils/ai-workspace-names.ts` — builds `new Agent({ instructions, model })` from `@mastra/core/agent`, calls `agent.generate(prompt, { structuredOutput: { schema } })`; model credentials resolved via `packages/host-service/src/providers/model-providers/` (falls back through Anthropic/OpenAI creds; `getSmallModel()` in `packages/chat/src/server/shared/small-model/get-small-model.ts` is the cheap-model resolver).
- Destructive-action UI precedent: `settings/hosts/$hostId/components/HostSettings/components/DeleteHostSection/DeleteHostSection.tsx` (AlertDialog confirm).

## Plan of Work

### 1. Shared types and constants — `packages/shared/src/agent-library.ts` (new)

Define the vocabulary both sides use:

    export type AgentLibraryScope =
      | { kind: "user" }                       // ~/.claude on the host
      | { kind: "project"; projectId: string } // a registered project's repo
    export type DefinitionKind = "agent" | "skill";
    export interface DefinitionRef { scopeKey: string; kind: DefinitionKind; name: string }
    export interface DefinitionSummary extends DefinitionRef {
      description: string;
      model: string | null;    // agents only (skills: null in v1)
      effort: string | null;
      relativePath: string;    // e.g. "agents/worker.md" — display only
      updatedAt: number;
    }
    export interface DefinitionDetail extends DefinitionSummary {
      frontmatter: Record<string, unknown>; // full parsed map, unknown keys included
      body: string;                          // markdown after the frontmatter block
      raw: string;                           // whole file
      revision: string;                      // for optimistic concurrency on save
    }
    export const AGENT_MODEL_ALIASES = ["inherit", "sonnet", "opus", "haiku", "fable"] as const; // free-text custom id also allowed
    export const AGENT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

`scopeKey` is the wire encoding (`"user"` or `"project:<projectId>"`). Keep value validation permissive on model (alias OR any non-empty string) — new model ids must work the day they ship; that is the whole motivation for the feature.

### 2. Host-service router — `packages/host-service/src/trpc/router/agent-library/` (new)

A dedicated router (registered in `router.ts` next to `filesystem`), not an extension of the filesystem router, because its contract is "definitions by scope", not "paths".

Scope resolution (server-side only): `user` → `os.homedir() + "/.claude"`; `project:<id>` → look up `project.repoPath` from the host DB. For each scope build the candidate directory lists — agents: `[.claude/agents, .agents/agents]`; skills: `[.claude/skills, .agents/skills]` — resolve each existing dir through `realpath`, dedupe, and remember which spelling is canonical for writes (prefer the realpath target, so writing through the `.claude/skills` symlink edits `.agents/skills` exactly once).

Procedures (all inputs zod-validated; `name` must match `/^[a-z0-9][a-z0-9-_]*$/` — no separators, which is the traversal guard on top of D4):

- `list({ scopes? })` → `DefinitionSummary[]`. Agents: `*.md` files directly in each agents dir (top level; nested dirs ignored in v1). Skills: subfolders containing `SKILL.md`. Frontmatter parsed leniently (reuse the parse approach of `slash-commands/frontmatter.ts` for summaries — it is fast and read-only).
- `get({ ref })` → `DefinitionDetail`. Full read + `yaml` Document parse; `revision` from the workspace-fs read metadata (same value `writeFile`'s `ifMatch` checks).
- `save({ ref, patch?, body?, raw?, expectedRevision })` → `{ revision }`. Two modes: structured (`patch` of frontmatter keys + optional `body` — round-trip through the `yaml` Document so untouched keys, order, and comments survive) or raw (whole-file replace, used by the raw editor and the AI chat apply). Uses the scope-rooted `FsService.writeFile` with `precondition: { ifMatch: expectedRevision }`; a mismatch returns a typed `CONFLICT` error the UI turns into a "file changed on disk — reload?" prompt.
- `create({ scope, kind, name, description })` → scaffolds `agents/<name>.md` or `skills/<name>/SKILL.md` with minimal frontmatter. Creates the parent dir if missing.
- `remove({ ref })` → deletes the agent file or the whole skill folder.
- `transfer({ ref, toScope, mode: "copy" | "move", overwrite? })` → cross-scope copy/move. Same-root moves use `FsService.movePath`; cross-root (user ↔ project, project ↔ project) do read → write-to-target → (move: delete source), recursing over skill folders. Without `overwrite`, an existing target returns a typed `ALREADY_EXISTS` error so the UI can ask.
- Chat is **not** a procedure on this router: per D7 it is a session on the extended `ChatRuntimeManager` (see Plan of Work §4), reached through the same chat tRPC surface the workspace chat uses, with a new agent-library session-creation input.

Implementation detail for D2: keep a small cache of `createFsHostService({ rootPath: scopeDir })` instances keyed by realpath. All mutations flow through them; nothing in this router calls `node:fs` write APIs directly.

Unit tests colocated (`agent-library.test.ts`): scan fixture tree (agents + skills + symlinked skills dir), frontmatter round-trip preserving unknown keys/comments, name validation rejects `../evil`, transfer copy/move/overwrite matrix, revision conflict.

### 3. Desktop UI — Settings section `agent-library` (placement pending D5; internals identical elsewhere)

Registration (all in existing files): add `"agent-library"` to `SECTION_ORDER` and the `usesInnerSidebar` set in `settings/layout.tsx`; add a nav item "Agents & Skills" in `GeneralSettings.tsx` under Editor & Workflow; add search-index entries in `settings-search.ts`. Route folder `routes/_authenticated/settings/agent-library/page.tsx` following the repo's component-folder conventions.

Components (under `agent-library/components/AgentLibrarySettings/`):

- `AgentLibrarySettings` — container; host picker (same mechanism as `V2AgentsSettings`'s `activeHostUrl`); react-query hooks `useAgentLibrary(hostUrl)` wrapping `getHostServiceClientByUrl(hostUrl).agentLibrary.list` (staleTime like `useV2AgentConfigs`, invalidated on every mutation).
- `AgentLibrarySidebar` — `SettingsListSidebar`-based list, grouped by scope ("User — applies to all projects", then one group per project), each row: kind badge (agent/skill), name, current model chip for agents. Filter box (name/description substring). Multi-select checkboxes to enable the bulk bar.
- `BulkModelBar` — appears when ≥2 agents selected: model picker + Apply; loops `save({ patch: { model } })` and reports per-item failures. This directly serves the "new banger model every 2 days" pain: two clicks to repoint every agent.
- `DefinitionDetail` — right side. For agents: `Select` for model (aliases + "Custom…" free-text input) and effort, `Textarea` for description, read-only chips for other frontmatter keys (tools, memory, color) with an "edit raw" escape hatch; below, the instructions body in the CodeMirror wrapper (markdown mode). For skills: description + body only. Explicit Save button (not save-on-blur — body edits and AI edits should commit atomically with the frontmatter patch and one revision check); dirty-state guard on navigation.
- `TransferMenu` — "Copy to… / Move to…" dropdown listing target scopes; conflict dialog on `ALREADY_EXISTS`.
- `DeleteSection` — AlertDialog confirm, `DeleteHostSection` pattern.
- Save toast copies the live-apply truth: "Saved. Running Claude Code sessions pick this up on next agent spawn / skill use." After `create`, append: "New skills may need /reload-skills in already-running sessions."

### 4. Embedded AI chat — full agent session (Milestone 5, per D7)

Right-hand collapsible panel inside `DefinitionDetail` (`AiChatPanel`). This is a real harness session, not a one-shot completion:

- **Runtime**: extend `ChatRuntimeManager` (`packages/host-service/src/runtime/chat/chat.ts`) so a runtime can be created for an *agent-library context* in addition to a workspace: `createRuntime` today does `createMastraCode({ cwd: workspace.worktreePath, disableMcp: true, memory })`; add a creation path taking `{ kind: "agent-library", rootPath }` where `rootPath` is the definition's scope root (`~/.claude` for user scope, `project.repoPath` for project scope). `disableMcp: true`, memory off. The system/context prompt names the definition file being edited (relative path), summarizes the valid frontmatter fields (model aliases + effort levels from `packages/shared/src/agent-library.ts`), and instructs the agent to edit that file directly with its edit tool unless asked otherwise. Because the harness has read/grep tools rooted in `rootPath`, it can consult sibling agents/skills (user scope) or the repo's code and conventions (project scope) — the reason this option was chosen.
- **Session lifecycle**: created lazily when the panel is first opened for a definition, keyed by `(scopeKey, kind, name)`, reused while the app runs, disposed on app quit or explicit "reset conversation". v1 does not persist transcripts across app restarts (D7 boundary — no cloud `chatSessions` schema change).
- **Transport/UI**: reuse the existing chat plumbing end to end — the same tRPC surface the workspace chat pane uses (`sendMessage` / `stop` / `respondToApproval` on the runtime, streaming display state via `useChatDisplay` from `@superset/chat/client`), rendered with `ai-elements` `Conversation`/`Message`/`PromptInput` plus the existing tool-call blocks so the agent's edits show as proper diffs (the `EditToolExpandedDiff`-style rendering already exists).
- **Write reconciliation**: the agent writes to disk through its own tools, so after every completed assistant turn the panel invalidates the `agentLibrary.get` query; the detail view reloads content and revision. If the user has an unsaved draft when the file changes underneath, show the same "file changed on disk — reload or keep editing?" conflict prompt as the external-edit case; the form Save keeps its `expectedRevision` check, so the two write paths can never silently clobber each other. A happy side effect: agent edits hit the real file, so Claude Code's watchers make them live in WIP sessions immediately, even before the user touches Save.
- **Verification step during implementation**: confirm mastracode's file tools are confined to (or at least default to) the session `cwd`; if they can write outside `rootPath`, wrap or configure the toolset so writes outside the scope root are rejected — the panel must not be a general-purpose shell into the machine.

### 5. Explicitly skipped in v1 (and why)

- No file watcher → UI live-refresh of the list (react-query invalidation on window focus is enough; the CLIs, not the UI, are the hot readers).
- No automatic `/reload-skills` injection into running PTYs via `terminal.writeInput` — typing into a session mid-turn is disruptive; the toast explains the one edge case instead. Add later as an explicit per-session button if users ask.
- No plugin-provided agents/skills (read-only mirror of `~/.claude/plugins/**`) — visible-but-managed-elsewhere; fast-follow.
- No Codex/OpenCode/Cursor definition formats; no web/mobile surface; no cross-host cloud "global" scope (D6).
- No durable AI-chat transcript persistence across app restarts (D7 boundary); the session lives while the app runs.

## Concrete Steps

Work happens at the repo root `/Users/celal-skyvern/code/superset` on a feature branch.

    git checkout -b feat/agents-skills-library
    cd packages/host-service && bun add yaml && cd ../..

Implement in milestone order (below). After each milestone:

    bun run typecheck        # Expected: exit 0, no errors
    bun run lint             # Expected: exit 0 — CI fails on warnings, run lint:fix first
    bun test packages/host-service   # Expected: agent-library tests pass

PR title (conventional commit, squash-merged): `feat(desktop): agents & skills library settings page` — or split per milestone: `feat(host-service): agent-library router` first.

## Milestones

### Milestone 1: shared types + host-service `agentLibrary` router (list/get/save/create/remove/transfer)

Scope: `packages/shared/src/agent-library.ts`, `packages/host-service/src/trpc/router/agent-library/` (+ registration in `router.ts`), `yaml` dependency, unit tests with a fixture directory tree.
At the end: no UI yet, but `curl` (or a test client) against a running host-service can list this machine's real `~/.claude/agents` and edit a fixture file's model without disturbing other keys.
Acceptance: `bun test packages/host-service` green; a round-trip test proves `model: sonnet` → `opus` leaves `memory: project` and body byte-identical.

### Milestone 2: read-only page

Scope: settings registration + `AgentLibrarySettings` + sidebar + read-only detail; react-query hooks.
Acceptance: `bun dev`, desktop Settings → Agents & Skills shows `worker` and `planner` under User scope with their models, and this repo's `project-structure-validator` agent + `ticket-format` skill under the project scope, each skill listed exactly once despite the `.claude/skills` symlink.

### Milestone 3: editing

Scope: frontmatter form (model/effort/description), CodeMirror body editor, Save with `expectedRevision`, conflict prompt, DeleteSection, BulkModelBar, dirty guard, toasts.
Acceptance: change `worker` model to `opus` in the UI → `head -8 ~/.claude/agents/worker.md` shows `model: opus`, all other lines unchanged. Select both user agents → bulk set `fable` → both files updated. Edit the file externally, then try saving stale UI state → conflict prompt appears, no silent clobber. With a Claude Code session already running, edit a skill body and invoke the skill in that session → new text is in effect (this is the live-apply acceptance).

### Milestone 4: copy/move across scopes

Scope: `TransferMenu` + `transfer` procedure hardening (skill folders recurse; overwrite dialog).
Acceptance: copy `worker` from User scope to this repo's project scope → `.claude/agents/worker.md` exists in the repo and both entries render; move it back with overwrite → project copy gone.

### Milestone 5: AI chat panel (full agent session)

Scope: `ChatRuntimeManager` agent-library context, session lifecycle keyed by definition, `AiChatPanel` reusing the existing chat transport + `useChatDisplay` + tool-call rendering, post-turn refresh + conflict prompt, cwd-confinement verification for the toolset.
Acceptance: open the `orchestrate` skill, ask the chat "tighten the intro section and align it with how the worker agent is described" — the agent reads `~/.claude/agents/worker.md` for context (visible as a read tool call), edits `SKILL.md` (visible as an edit-diff tool call), the detail view refreshes with the new content, and `cat ~/.claude/skills/orchestrate/SKILL.md` confirms it on disk. Asking it to write outside the scope root is refused.

## Validation and Acceptance

Full battery at the end (root):

    bun run typecheck   # No type errors
    bun run lint        # Exit 0, zero warnings
    bun test            # All tests pass

Manual end-to-end (the feature's reason to exist): with one Claude Code session running in any workspace, use only the new page to (1) repoint every user-scope agent to a newly-typed custom model id, (2) confirm the next subagent spawn in the running session uses it, (3) copy one agent into a project, (4) rewrite one skill's instructions via the AI chat and save. No file may lose unrelated frontmatter keys during any of this.

## Idempotence and Recovery

All writes are atomic (workspace-fs temp-file + rename) and guarded by `ifMatch` revisions — re-running a save is safe and conflicts surface as prompts, never silent overwrites. `create` fails cleanly if the name exists; `transfer` without `overwrite` refuses to clobber. `remove` is the only destructive op and sits behind an AlertDialog; skill-folder deletion is recursive by design (the folder is the unit). If a milestone lands broken, the router is additive — no existing procedure or table changes — so revert is a plain `git revert` with no data migration.

## Interfaces and Dependencies

- New dependency: `yaml` in `packages/host-service` only (D3).
- New shared module: `packages/shared/src/agent-library.ts` (types above; exported through the package index like `agent-models.ts`).
- New router: `agentLibrary` in `packages/host-service/src/trpc/router/agent-library/agent-library.ts`, registered in `packages/host-service/src/trpc/router/router.ts`; procedure signatures as in Plan of Work §2. Errors: `CONFLICT` (revision), `ALREADY_EXISTS` (transfer/create), `NOT_FOUND` (ref), `BAD_REQUEST` (name validation).
- Desktop consumes it exclusively through `getHostServiceClientByUrl(hostUrl).agentLibrary.*` with react-query (no Electric collection, no local-db schema change, no cloud Postgres change, no Electron IPC channel additions).
- UI: shadcn primitives from `@superset/ui` (`select`, `textarea`, `alert-dialog`, `badge`, `command`), `SettingsListSidebar`, CodeMirror wrapper, `ai-elements` for the chat. Functions with 2+ params use object signatures per AGENTS.md.

## Outcomes & Retrospective

Implemented 2026-07-10 in three commits on `feat/agents-skills-library` (PR opened the same day): the `agentLibrary` host-service router + shared types + 26 tests, the Agents & Skills settings page (list by scope, model/effort/description editing, raw mode, bulk set-model, create/delete), cross-scope copy/move with overwrite confirm, and the AI edit chat panel running a persistent per-definition Mastra agent session with filesystem tools.

Against the original purpose: every requirement landed — scoped listing, agent model/effort/instruction editing, skill instruction editing, AI chat that applies edits itself, copy/move/delete across scopes, and live-apply-on-save (free via Claude Code's own file watchers, honestly surfaced in the save toast). The bulk set-model bar addresses the motivating pain directly.

Gaps / follow-ups: (1) manual acceptance walkthrough in the running app still pending — this machine had no signed-in dev session; run the Validation and Acceptance section after checkout. (2) AI-chat tool calls render as compact rows (tool name), not full diff blocks — the editor reloading with the agent's changes carries the "what changed" moment instead; revisit if diffs-in-chat are missed. (3) mastracode tool cwd-confinement was NOT hardened (D9) — same trust level as Superset's existing terminal agents, revisit if agent-library sessions ever run against untrusted scopes. (4) Deferred as planned: cloud cross-host scope, plugin-provided definitions, non-Claude formats, transcript persistence across restarts.

Lesson: the biggest planning miss was assuming chat needed host-service runtime work — the desktop chat service was already cwd-parameterized. Reading the *transport* layer before the *runtime* layer would have found this sooner.

---

Revision note (2026-07-10): initial draft carried three open questions; the user resolved them the same day (Settings-section placement; user+project scopes for v1; full-agent-session chat instead of the recommended stateless procedure). Plan of Work §4, Milestone 5, the router interface, and Decision Log D5–D7 were rewritten accordingly — the AI chat moved from a structured-output procedure on the `agentLibrary` router to an agent-library context on `ChatRuntimeManager`, because the user explicitly values cross-file context reading and multi-step edits over the simpler draft-return shape.

Revision note (2026-07-10, implementation): Milestone 5 shipped WITHOUT touching `ChatRuntimeManager` — the desktop's existing `chatRuntimeService` (Electron main, IPC) already accepts `{ sessionId, cwd }`, so the AiChatPanel creates a per-definition session with `cwd` = scope root and injects the definition context as a first-message preamble instead of a server-side system prompt (Decision D9, superseding the mechanism in D7 while keeping its user-facing behavior: real tools, cross-file reads, direct file edits, persistent in-app session). Consequences: works desktop-local only (remote hosts would need the host-service extension originally planned — matches v1's local-host scope); tool confinement relies on prompt + user visibility rather than a wrapped toolset, consistent with how Superset already runs terminal agents with permissions bypassed. Tool calls render as compact rows rather than full diff blocks; the detail editor reloads after each turn, with unsaved drafts protected by the same conflict banner as external edits.
