# Canonical Workspace Create Flow

## Summary

Workspace creation should be a single host-service orchestration flow. Today the renderer drives too much of the lifecycle: it creates a pending row, creates or checks out the workspace, loads attachments, builds launch prompts, writes attachment files, stores transient launch intent, navigates, and then relies on the workspace route mounting to actually start or reveal work.

The target is to move workspace creation behind one `workspaces.create` API and split launches (`agents.run`, `terminals.run`) into their own resources. The renderer uploads attachments separately, calls `workspaces.create` (optionally with the `agents` sugar to spawn an agent in the same call), writes returned terminals + agent sessions into the workspace pane store, and navigates. The workspace route renders existing pane state; it does not start agents or populate panes as a side effect of mounting.

## Goals

- Provide one create contract usable by the new workspace modal, task view, automations, CLI, and future flows.
- Support creating a workspace with zero, one, or many requested launches.
- Keep user-editable prompts as plain Markdown.
- Keep attachments host-scoped and independent of workspaces.
- Start terminal/chat sessions in host-service, without requiring renderer navigation.
- Remove pending workspace launch orchestration and route-mount launch effects.

## Public APIs

### Attachments

Add host-scoped attachment APIs:

```ts
attachments.upload({
  data,
  mediaType,
  originalFilename?,
}) => {
  attachmentId,
  originalFilename?,
  mediaType,
  sizeBytes,
}

attachments.delete({ attachmentId }) => { success: true }
```

Attachments are stored on the selected host, not in Superset cloud:

```txt
~/.superset/attachments/<attachmentId>/<attachmentId>.<ext>
~/.superset/attachments/<attachmentId>/metadata.json
```

`attachmentId` is the only stable identifier. The extension is derived from MIME type, and original filename is metadata only.

### Workspace Create

Replace the current narrow `workspace.create({ projectId, name, branch })` with one method that takes the *source* of the workspace (a branch name or a PR number) and returns a uniform shape. Other launch verbs (`agents.run`, `terminals.run`) stay separate.

```ts
workspaces.create({
  projectId: string;
  name: string;

  // Source — exactly one of `branch` or `pr` is required. Server picks the
  // right machinery based on which is set; caller never picks a "mode".
  branch?: string;
  pr?: number;

  // Branch-source modifier: git ref to fork from when `branch` does not exist.
  // Defaults to the project's default branch as a remote-tracking ref
  // (e.g. "origin/main"). Pass "main" for fork-from-local. Ignored when `pr`
  // is set — the PR head is the start point.
  baseBranch?: string;

  // Optional metadata link to N Superset tasks. Cloud persists into the
  // workspace_tasks join (see "Task linking" below). Composes with any source.
  taskIds?: string[];

  // Internal flag — when true, server fires a post-create AI rename of the
  // workspace (and its branch) from the prompt as a background side-effect.
  // Default false. Not surfaced in the SDK / CLI / MCP type definitions; the
  // desktop renderer passes it directly via electronTrpc. See "AI naming".
  autogenerateName?: boolean;

  // Sugar: spawn agents immediately after create. Equivalent to calling
  // `agents.run` once per entry. See "Launching agents" below.
  agents?: AgentLaunch[];
}) => {
  workspace: { id: string; projectId: string; name: string; branch: string };
  // Terminals started by *this* call. Empty when alreadyExists (server doesn't
  // re-run setup script for an existing workspace).
  terminals: Array<{ terminalId: string; label?: string }>;
  // Per-entry results for the `agents` sugar. Spawned even when alreadyExists,
  // so retries and "make sure this workspace has this agent running" intents
  // work cleanly. Empty when sugar wasn't requested.
  agents: AgentLaunchResult[];
  // True when the resolved source mapped to an existing workspace. The
  // workspace itself is reused; sugar `agents` still spawn against it.
  alreadyExists: boolean;
};
```

Branch resolution: if `branch` exists locally or as a remote-tracking ref, it is checked out; otherwise it is created from `baseBranch`. That collapses the previous `fork` / `checkout` discriminated union.

PR resolution: server runs `gh pr view <pr> --json` to fetch metadata, derives a unique local branch name (handles cross-fork PRs where the head ref alone isn't enough), runs `gh pr checkout` inside a detached worktree, and configures push/upstream. Caller passes only `pr: number`; the rest is server detail.

Conflict handling: if the derived branch already has a Superset workspace, server returns it with `alreadyExists: true` and still runs any sugar `agents[]` against it (sugar reads as "make sure this workspace has these agents running" — calling twice spawns two sessions, which is fine for retry semantics). If the branch exists in git but no Superset workspace tracks it (e.g. user ran `gh pr checkout` outside Superset), server throws a `CONFLICT` error pointing at the orphaned branch — caller can show a confirm dialog or surface the message. No silent force-resets, no `force` flag.

Why one method instead of two: PR vs branch is just *which source field is set*, not a different verb with different downstream fields. The return shape is identical. Splitting them into `workspaces.create` and `workspaces.fromPullRequest` would mean two SDK methods, two CLI subcommands, two sets of sugar handling — for a difference that's one optional field on the input. The cost isn't worth it.

CLI shape:

```
superset workspace create --branch feat/auth
superset workspace create --pr 1234
```

### Original four flows, mapped

The previous draft had a `mode` discriminated union with four kinds. All four are still supported, just consolidated:

| Original mode | New shape | Where it lives |
|---|---|---|
| `fork` (new branch from base) | `workspaces.create({ branch, baseBranch? })` — branch doesn't exist yet | Public |
| `checkout` (existing branch) | `workspaces.create({ branch })` — branch exists locally or as remote-tracking | Public |
| `pr-checkout` (PR number) | `workspaces.create({ pr })` | Public |
| `adopt` (worktree exists on disk, no Superset workspace) | host-service-internal `adopt` procedure | Internal |

Adopt's only callers today are the desktop new-workspace modal's "existing worktree" picker and the v1→v2 migration. CLI / SDK / MCP users never touch it. Keeping it host-internal means the public surface doesn't carry a verb that nobody calls.

Future sources slot in as additional optional fields under the same exactly-one-of rule. *Metadata* fields (like `taskIds`) compose with any source instead of replacing one. The decision per new field is "is this where the workspace comes from, or is this metadata about the workspace?" — the surface stays one method either way.

### Task linking

Workspaces and tasks are many-to-many: a workspace can be working on several tasks (common when batching small fixes), and a task can have several workspaces (multi-attempt automations, parallel agents).

Schema (cloud DB):

```ts
workspaceTasks = pgTable("workspace_tasks", {
  workspaceId: uuid("workspace_id").notNull().references(() => v2Workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.taskId] }),
  index("workspace_tasks_task_idx").on(t.taskId),
]);
```

Composite PK enforces uniqueness; the leading column covers workspace→tasks lookups, the explicit index covers task→workspaces lookups. Cascade deletes on both sides.

Operations:

```ts
workspaces.linkTask({ workspaceId: string; taskId: string }) => { success: true };
workspaces.unlinkTask({ workspaceId: string; taskId: string }) => { success: true };
```

`workspaces.create({ taskIds: [...] })` writes the join rows atomically with the workspace row (single transaction in the cloud-layer create).

### Launching agents

Launches are a separate resource. They run against an existing workspace and are repeatable. Both verbs are idempotent at the workspace level — calling `agents.run` twice spawns two sessions.

```ts
type AgentLaunch = {
  // Either a preset id ("claude", "codex", "amp", …) or a HostAgentConfig
  // instance id. Host-service resolves by trying instance id first, then preset
  // id with the lowest `order` winning.
  agent: string;
  prompt: string;
  attachmentIds?: string[];
};

type Session = { sessionId: string; label?: string };

type AgentLaunchResult =
  | ({ ok: true } & Session)
  | { ok: false; error: string };

agents.run({
  workspaceId: string;
} & AgentLaunch) => Session;

terminals.run({
  workspaceId: string;
  command: string;
  label?: string;
}) => { terminalId: string };
```

The sugar `agents` field on `workspaces.create` is exactly equivalent to a `workspaces.create` call followed by N `agents.run` calls dispatched in parallel. Each entry succeeds or fails independently and is reported as an `AgentLaunchResult` in the response. Use the explicit two-step form when the caller wants to branch logic between create and launch (e.g. inspect the workspace before deciding what to run).

Notes:

- `prompt` is required on every agent launch. A promptless run is `terminals.run({ command: "claude" })`.
- `agent` accepts either a preset id or a `HostAgentConfig` instance id, in one field. Host-service resolves by trying instance id first, then falling back to first match by `presetId` (ordered by `order`). The renderer agent picker sends the instance id since it knows exactly which row the user clicked; CLI/SDK/MCP callers send a preset string and don't think about the storage model. Preset ids are short slugs and instance ids are UUIDs, so they don't collide.
- `attachmentIds` are host-scoped IDs from the attachment store. Host-service resolves them to absolute paths and appends a deterministic block to the prompt at launch time. Renderer never sees paths.
- `terminals` covers what the server starts on its own (today: `.superset/setup.sh`). Caller renders these the same way it renders sugar `agents` results.
- `agents.run` returns terminal-backed sessions only for v1 (`HostAgentConfig` is terminal-only per PR1). Superset Chat is launched separately from the workspace's chat tab via `chat.createSession`, not through this surface. If chat-backed agents land later, the `Session` type can grow a `kind` discriminator additively.

### What is not in the create input

These were in the previous draft (or current code) and are now elsewhere or removed:

- `mode` discriminated union → flat `branch` + `pr` source fields (exactly one). Adopt stays host-internal.
- `launches[]` with mixed terminal/agent kinds → `agents.run` and `terminals.run` are separate verbs. Multiple agents at create are still supported via the `agents` sugar; raw terminals at create are not — call `terminals.run` after. If a real use case shows up, sugar can be added later (additive, not breaking).
- `runSetupScript: boolean` toggle → removed. Server always runs `.superset/setup.sh` when present and returns the session in `terminals`. The current modal toggle is desktop-only and not wired in v2; we don't need a public flag for it. Users who want to skip setup can move the script aside.
- `warnings: string[]` → removed. Server throws on the only condition that needed it (orphan local branch). Per-launch failures surface as `{ ok: false, error }` in `agents`.
- `force` / `--force` → removed. The previous code used `gh pr checkout --force` and warned about clobbering; the new flow refuses up front, no flag needed.
- `workspaceNameWasAutoGenerated` flag → renamed to `autogenerateName` and kept as a desktop-only opt-in. Not surfaced in the SDK / CLI / MCP type definitions; desktop sets it via raw tRPC when the user didn't type a name. The post-create AI rename side-effect stays intact (see "AI naming" below) — opt-in by this flag, not implicit.
- `linkedContext` blob (`internalIssueIds`, `githubIssueUrls`, `linkedPrUrl`, `attachments`) → split into purpose-specific fields: tasks via `taskIds`, attachments via `attachmentIds` on agent launches, issue/PR *context* via prompt Markdown (see "Linked context" below). The original `linkedContext` field was dead in host-service anyway.

### Linked context (issues / PRs that aren't sources)

Today's modal lets users link N GitHub issues and an optional non-source PR for the agent to read. The renderer pre-fetches issue/PR bodies and synthesizes Markdown attachments (`github-issue-123.md`, etc.).

The new shape doesn't add API fields for this. Linked context is *prompt content*, not workspace data. The renderer:

- Fetches issue/PR content via existing helpers (`projects.getIssueContent`, `gh pr view`).
- Either inlines the rendered Markdown into the agent's `prompt`, or uploads it via `attachments.upload` and passes the resulting `attachmentId` on the agent launch.

This stays consistent with the boundary "prompt is plain Markdown the caller authors." CLI / SDK / MCP callers don't need a special field — they include the context in the prompt themselves. The previous `linkedContext` blob (`githubIssueUrls`, `linkedPrUrl`, `internalIssueIds`) was dead in host-service anyway; this just makes the boundary explicit.

Note: `pr` as a *source* (use this PR's branch as the workspace branch) is different — that's `workspaces.create({ pr })`. Linking a PR for *context* (workspace is on a different branch but agent should know about a related PR) goes in the prompt.

### AI naming

Today host-service auto-renames a freshly-created workspace from its prompt as a background side-effect of `workspaceCreation.create`, gated by a `workspaceNameWasAutoGenerated` flag. The new shape preserves this exact behavior with a renamed flag that's deliberately *not* part of the public SDK / CLI / MCP surface:

- `workspaces.create({ ..., autogenerateName: true })` triggers a fire-and-forget AI rename in the same code path as today's `applyAiWorkspaceRename`. Server generates a workspace name + branch name from the prompt in the background, updates `v2Workspaces.name` / `v2Workspaces.branch`, renames the worktree directory, and lets Electric sync deliver the change to the renderer.
- The flag exists on the cloud-trpc input schema but is **omitted from the SDK / CLI / MCP type definitions** (Pick / Omit at the SDK boundary). The desktop renderer passes it directly via electronTrpc. CLI / SDK / MCP callers can't see it and don't accidentally trigger AI rename when they pass user-chosen names.
- Default `false` everywhere. Naming the flag `autogenerateName` (imperative "do this") rather than `nameWasAutoGenerated` (descriptive "this state was true") makes it read as a directive to the server, not a state report.

This keeps the public API minimal and predictable for non-desktop callers, while preserving the single-call create UX for desktop without an extra round-trip.

`workspaces.generateBranchName({ projectId, prompt }) => { branchName }` stays as a separate synchronous query for the modal's "✨ suggest a branch name" button before submit. Already exists today; just moves to the new router.

### Workspace `type` is internal

The `v2Workspaces.type: "main" | "worktree"` distinction is implementation, not public surface. Every (project, host) pair has one auto-managed `main` workspace pointing at the repo root, created by `ensureMainWorkspace` from project setup and the startup sweep. Users only ever create `type: "worktree"` workspaces via this API; they never see or set `type` directly.

### Why split create from launch

Same reasoning as OpenCode's `session.create` / `session.prompt` split. Each call has a small flat input that maps cleanly to CLI flags, SDK parameters, MCP tool inputs, and the renderer modal — instead of a four-arm discriminated union with nested launch arrays that every surface has to model. Composition is open: "create, run two agents, attach a terminal" is three calls, not new fields. Code share is real because the renderer's modal calls the same two methods the CLI does.

## Host-Service Flow

`workspaces.create` owns workspace creation. Launches run through their own procedures. The split mirrors the public API.

`workspaces.create`:

1. Resolve the local project/repo.
2. Resolve the source:
   - **`branch` set**: if `branch` exists locally or as a remote-tracking ref, check it out; otherwise create it from `baseBranch` (default: project's default branch via remote-tracking).
   - **`pr` set**: run `gh pr view <pr> --json` to fetch metadata; derive a unique local branch name (handles cross-fork PRs); run `gh pr checkout` inside a detached worktree; configure push/upstream.
3. Conflict checks:
   - If a Superset workspace already tracks the resolved branch, set `alreadyExists = true`, skip new-workspace steps (4-6), and proceed to step 7 to run sugar `agents[]` against the existing workspace.
   - If the resolved branch exists in git but no Superset workspace tracks it, throw `CONFLICT` with the orphan branch name. No silent overwrite.
4. Register the host and cloud workspace row; persist the local row.
5. Forward `taskIds` to cloud (if set) so the cloud-layer create can insert the `workspace_tasks` join rows atomically with the workspace row.
6. If `.superset/setup.sh` exists, start it as a terminal session and add it to `terminals`.
7. If the request included sugar `agents[]`, dispatch each entry through the same path as `agents.run` (against the new or existing workspace) and collect per-entry `AgentLaunchResult`s.
8. Return `{ workspace, terminals, agents, alreadyExists }`.

Adopt of an existing worktree stays a host-service-internal procedure (used by the modal's existing-worktree picker and the v1→v2 migration). It is not exposed via the public SDK / CLI / MCP surface and is out of scope for this doc.

`agents.run`:

1. Resolve the workspace.
2. Resolve `agent` against host-local `HostAgentConfig` rows: try exact `id` match first, then fall back to first match by `presetId` ordered by `order`. Fail clearly if no match.
3. Resolve `attachmentIds` to absolute host paths.
4. Append a deterministic attachment block to the prompt when attachments exist.
5. Spawn the configured argv per the PR1 launch spec — `[command, ...args, ...promptArgs, prompt?]` for `argv` transport, or pipe the prompt to stdin for `stdin` transport. Apply the config's `env` overlay.
6. Return the session.

`terminals.run`: spawn the requested command in the workspace's cwd. Return the terminal id.

The attachment prompt block stays host-local, with absolute paths:

```md
# Attached files

The user attached these files. They are available on this host at:

- /Users/satya/.superset/attachments/<attachmentId>/<attachmentId>.png
```

## Renderer Flow

Interactive UI flows work like this:

1. User selects a target host.
2. User attaches files; renderer calls `attachments.upload()` on the selected host immediately and stores returned `attachmentId`s plus display metadata in local Zustand state.
3. If the selected host changes, clear or reupload attachments.
4. On submit, renderer calls `workspaces.create({...})` with the `agents` sugar populated when the user picked an agent + prompt.
5. After create resolves, renderer writes `terminals` and successful `agents` results into the workspace pane store via `addLaunchPanes` (PR3).
6. Renderer navigates to `/v2-workspace/$workspaceId`.

The workspace route only renders the existing pane store. It is never required to start agents, consume pending launch intent, or populate panes as a side effect of mounting.

## Pane Store Registry

Add a renderer-level registry:

```ts
getOrCreateWorkspacePaneStore(workspaceId)
```

The workspace route and create callers should both use this registry. That makes pane state writable before navigation.

Add a helper that deduplicates and focuses panes:

```ts
addLaunchPanes(workspaceId, launches)
```

It should:

- create or fetch the pane store for `workspaceId`;
- add terminal panes for each returned session id (v1 returns terminal-backed only);
- dedupe by session ID;
- focus the created or existing pane.

## Prompt Building Boundary

Prompt templates are separate from workspace creation.

The create API accepts user-editable Markdown on each agent launch:

```ts
{ agent, prompt, attachmentIds }
```

Template systems can generate that Markdown before submit, and users can edit it freely. `workspaces.create` does not need to know whether the prompt came from a saved template, a task view button, an automation, CLI input, or manual typing.

Host-service owns only runtime prompt finalization:

- resolve attachment IDs to readable host paths;
- append the attachment block;
- adapt the prompt for the selected agent config;
- start the session.

This keeps semantic prompt authoring host-independent while keeping host-local paths host-owned.

## Prompt Builder Design

The prompt builder should be split into two responsibilities:

1. Template rendering before create.
2. Runtime prompt finalization during create.

### Template Rendering

Templates produce Markdown. They are not part of the `workspaces.create` contract.

Saved templates, task view actions, automations, CLI helpers, and manual input should all eventually produce the same simple value:

```ts
prompt: string
```

The renderer may support a template authoring flow like:

```ts
promptTemplates.render({
  templateMarkdown,
  variables,
}) => {
  prompt: string,
  unresolvedVariables: string[],
}
```

This can be implemented in shared code or a cloud/API endpoint. It should not require a selected host because it only resolves host-independent values such as issue title, PR title, task title, or user-supplied variables.

The UI can use this to show unresolved variables before submit. Users should always be able to edit the rendered Markdown before launching.

### Runtime Prompt Finalization

Host-service finalizes prompts only at launch time.

For each requested agent launch (via `agents.run` or the `agents` sugar on `workspaces.create`), host-service receives:

```ts
{
  agent: string,           // preset id or HostAgentConfig instance id
  prompt: string,
  attachmentIds?: string[],
}
```

Host-service then:

- resolves `agent` against host-local `HostAgentConfig` rows (instance id first, then preset id by `order`);
- resolves each `attachmentId` from the selected host's attachment store;
- adds an attachment section to the prompt when attachments exist;
- spawns the configured argv per the PR1 launch spec, with the prompt as either an argv tail or piped to stdin (`promptTransport`);
- returns the session.

The attachment section should be deterministic and host-local:

```md
# Attached files

The user attached these files. They are available on this host at:

- /Users/satya/.superset/attachments/<attachmentId>/<attachmentId>.png
```

Original filenames may be included as display metadata in the block, but they should not be used as filesystem paths.

### What The Client Should Not Do

The renderer should not:

- resolve attachment IDs to paths;
- decide attachment filenames;
- write attachment bytes into worktrees;
- build terminal command strings for agent launches;
- read agent prompt templates directly to produce runtime-specific commands;
- fetch GitHub issue or PR bodies solely to assemble the final launch prompt.

The renderer can preview and edit human-authored Markdown, but host-service owns runtime-specific prompt assembly.

### Agent Configs

Agent configs are host-local launch profiles. They encode real runtime and security preferences: CLI flags, approval mode, sandboxing behavior, model selection, and command spec. Those preferences can reasonably differ per machine.

Responsibilities:

- Product/settings UI owns editing agent profiles on the selected/local host.
- `host.db` (PR1) owns persistence.
- Host-service owns runtime validation and execution.
- Public callers (renderer, CLI, SDK, MCP) pass `agent: string` — a preset id or instance id — never reconstruct argv themselves.

For v1, an instance id is host-scoped; the same instance id only resolves on the host that wrote it. Preset ids (`"claude"`, `"codex"`, etc.) are stable across hosts. Cross-device synced agent profiles are a later product decision.

For `workspaces.create` and `agents.run`, an agent launch always has a prompt. Promptless invocations go through `terminals.run` with the agent's executable as the command:

```ts
terminals.run({ workspaceId, command: "claude", label: "Claude" })
```

That lets agent profiles focus on one job: "given a Markdown prompt, how does this host start this agent?"

The host-local config model is a list of configured preset instances. Hardcoded presets provide defaults; stored entries represent the agents this host actually exposes. The full type is defined in PR1 (`plans/20260425-host-agent-configs-pr1.md`); summary:

```ts
type HostAgentConfig = {
  id: string;               // instance id (UUID)
  presetId: string;         // "claude", "codex", "custom-terminal", …
  label: string;
  order: number;
  command: string;          // executable
  args: string[];           // argv that's always present
  promptTransport: "argv" | "stdin";
  promptArgs: string[];     // argv inserted only when launching with a prompt
  env: Record<string, string>;
};
```

Launch resolution at runtime is mechanical:

```ts
const argv = prompt
  ? [command, ...args, ...promptArgs, ...(promptTransport === "argv" ? [prompt] : [])]
  : [command, ...args];
// promptTransport === "stdin" with a prompt: pipe `prompt` to stdin.
```

Configured entries are the available agents. Removing an entry removes it from the picker. Adding an entry copies a hardcoded preset's fields into a new instance with a fresh `id`. Reordering edits `order`.

Superset Chat is not part of this host-local terminal agent config model for v1. It can appear as a launch option, but its model/provider behavior stays in chat/model settings.

Icons are not stored in config for v1. The UI resolves icons from `presetId`. Builtins get branded icons; custom-terminal entries get a generic icon.

Do not include a file-based prompt input mode in v1. It may be useful later for CLIs with native `--prompt-file` support or to dodge shell argument limits, but none of the current builtins require it and the prompt transport enum is `argv | stdin` only.

Host-service validates at launch:

- the agent config exists;
- `command` is resolvable on `PATH`;
- `promptTransport` is one of `argv | stdin`;
- `args` / `promptArgs` are well-formed.

If the configured executable is unavailable on the host, `agents.run` (or the sugar entry on `workspaces.create`) fails that specific launch with a clear error. The workspace create itself still succeeds; the failure is reported per-entry in `agents[]`.

Security boundary:

- User-owned configs may run user-configured commands on that user's host.
- Host-local capabilities, paths, tokens, and installed tools remain host-owned and are never assumed from synced config alone.

The invariant:

> Instance ids are stable only within a host. Preset ids are stable across hosts. The renderer selects from the target host's available profiles; host-service resolves whichever was sent and launches it.

## Router Migration

`workspaceCreation` is deprecated, not extended. Behavior moves to the new methods:

| Old procedure | New home |
|---|---|
| `workspaceCreation.create` (fork) | `workspaces.create` (branch-source path) |
| `workspaceCreation.checkout` (branch path) | `workspaces.create` (branch-source path) |
| `workspaceCreation.checkout` (PR path) | `workspaces.create` (PR-source path) |
| `workspaceCreation.adopt` | host-internal `adopt` procedure (kept; not exposed publicly) |

New public methods on the workspace router: `workspaces.create`, `workspaces.linkTask`, `workspaces.unlinkTask`. Existing `workspace.get`, `workspace.gitStatus`, `workspace.delete` stay.

New launch routers: `agents.run`, `terminals.run`. New attachment router: `attachments.upload`, `attachments.delete`.

Move or delete remaining `workspaceCreation` helpers:

- `getProgress`: delete; create is promise-based for v1.
- `searchBranches`: move to `workspaces.searchBranches` (still needs to return state per branch — local / remote-tracking / has-existing-worktree — so the modal can pick the right intent).
- `generateBranchName`: move to `workspaces.generateBranchName`.
- AI rename side-effect on `workspaceCreation.create`: stays as a side-effect of `workspaces.create`, gated by the new `nameWasAutoGenerated` flag (default false). Same `applyAiWorkspaceRename` code path as today.
- GitHub issue/PR search and content helpers (`searchGitHubIssues`, `searchPullRequests`, `getGitHubIssueContent`, `getGitHubPullRequestContent`): move to a `github` router. Renderer keeps using them to render linked-context Markdown before submit.
- `getContext`: delete if no new caller needs it.

The host-internal `adopt` procedure stays where it is, just no longer exposed publicly. v1→v2 migration and the modal's "existing worktree" picker keep using it directly.

After callers migrate, remove `workspaceCreation` from `appRouter`.

## Logic To Remove

This design should let us remove:

- pending workspace route as create orchestration;
- pending row `terminalLaunch` / `chatLaunch` intent;
- `dispatchForkLaunch`;
- renderer-side terminal command construction for create flows;
- renderer-side attachment file writing;
- renderer-side attachment filename generation;
- route-mount behavior that starts agents;
- `workspaceCreation.getProgress`.

## UI Cleanup And Adjustments

The new UI model should be simpler and more explicit.

### New Workspace Modal

Replace the current pending-row flow with direct mutation state:

- upload attachments to the selected host as they are added;
- store uploaded attachment metadata in modal-local Zustand state;
- call `workspaces.create({...})` on submit (with `agents` sugar populated when the user picked an agent);
- show loading while the create promise is in flight;
- write returned `terminals` and successful `agents` results into the workspace pane store via `addLaunchPanes`;
- navigate to the created workspace.

Remove modal plumbing that only exists for pending orchestration:

- storing attachment blobs in IndexedDB for this flow;
- creating a pending workspace row before the host create call;
- routing through `/pending/$pendingId` to continue creation;
- serializing `terminalLaunch` or `chatLaunch` onto a row;
- preserving `runSetupScript` draft state.

### Pending Workspace Route

The pending route should no longer be the owner of create orchestration.

Delete or shrink code that:

- reads pending attachment blobs;
- calls `workspaceCreation.create`, `checkout`, or `adopt`;
- fetches PR content to build launch payloads;
- calls `dispatchForkLaunch`;
- updates pending status for launch dispatch;
- polls `workspaceCreation.getProgress`.

If a loading screen is still desired, it should be a UI state around a running mutation or a future `workspace.operations.*` operation, not a renderer-owned creation state machine.

### Workspace Route

The workspace route should become a renderer of pane state.

It should not:

- consume pending launch intent;
- create terminal/chat sessions as a mount side effect;
- parse query params for fresh create flows;
- populate panes because a create flow navigated there.

It may keep compatibility adoption for existing automation run links temporarily, but new internal callers should use the shared pane store helper.

### Pane Store

Move pane store access behind a registry:

```ts
getOrCreateWorkspacePaneStore(workspaceId)
addLaunchPanes(workspaceId, launches)
```

This lets callers populate panes before route mount. The route should read the same store instance.

### Automations And CLI

Automations call `workspaces.create({ ..., agents: [...] })` instead of doing:

1. workspace create;
2. separate chat or terminal dispatch;
3. separate run-row session wiring.

The automation run row persists the returned workspace ID and the per-entry session IDs from the response's `agents[]`.

CLI calls the same endpoint and prints the returned workspace and session IDs. It does not need pane store logic.

## PR Boundaries And Implementation Order

The work splits into 5 PRs total. PRs 1–3 are foundational (already in flight or merged) and PRs 4–5 are the canonical create rewrite. The split between PR4 and PR5 is "additive cutover" vs "deletes" — PR4 ships the new flow end-to-end (API + UI), PR5 rips out the old machinery now that nothing reaches it.

### PR 1: Host-Local Agent Config Model

Goal: introduce the new configured-agent-instance model without changing workspace creation.

Changes:

- Add hardcoded terminal agent presets with `presetId`, label, default `command` + `args`, default `promptArgs`, default `promptTransport`, default `env`, and UI icon mapping (per the argv-array spec in `plans/20260425-host-agent-configs-pr1.md`).
- Add host-local storage for `HostAgentConfig` rows in `host.db`.
- Add host-service settings APIs (`settings.agentConfigs.list/add/update/remove/reorder/resetToDefaults`).
- v1→v2 migration of existing desktop preset/custom-agent overrides is a separate follow-up, not part of PR1.
- Keep existing renderer consumers working: PR1 only adds the V2 settings UI under `FEATURE_FLAGS.V2_CLOUD`. Non-V2 keeps the legacy `settings.getAgentPresets()` UI unchanged.

Tests:

- migration preserves current configured agents;
- duplicate preset instances are allowed;
- removing an entry removes it from resolved agents;
- order is stable;
- builtins resolve defaults when overrides are missing.

### PR 2: Host Attachment Store

Goal: make attachments host-scoped resources independent of workspaces.

Changes:

- Add `attachments.upload` and `attachments.delete` on host-service.
- Store files under `~/.superset/attachments/<attachmentId>/<attachmentId>.<ext>`.
- Store metadata sidecar.
- Enforce file size/type caps.
- Add renderer attachment state that stores uploaded IDs and display metadata.
- Do not remove the old IndexedDB path yet; keep it for the existing pending route until create is migrated.

Tests:

- upload writes bytes and metadata;
- delete removes the attachment directory;
- invalid media type/oversized file is rejected;
- host change clears or reuploads pending attachment IDs.

### PR 3: Pane Store Registry

Goal: make workspace panes writable before route mount.

Changes:

- Add `getOrCreateWorkspacePaneStore(workspaceId)`.
- Update the workspace route to read from the registry.
- Add `addLaunchPanes(workspaceId, launches)` with dedupe/focus behavior.
- Keep current query-param/pending launch adoption temporarily.

Tests:

- panes can be added before navigation;
- route renders pre-populated panes;
- duplicate terminal/chat IDs do not create duplicate panes.

### PR 4: New API + new UI (additive cutover)

Goal: ship the new flow end-to-end — new public API, new modal, all callers (modal, task view, automation dispatch, CLI, MCP) flipped onto it. The old `workspaceCreation.create/checkout/adopt` procedures stay in the host-service router but are no longer reachable from any caller. Build stays green throughout: nothing's deleted yet.

API + host-service work:

- Add `workspaces.create` with the input/output shape from "Workspace Create" above (`branch | pr` source, optional `baseBranch`, `taskIds`, `agents` sugar, `autogenerateName` desktop-only flag). Returns `{ workspace, terminals, agents, alreadyExists }`. Throws `CONFLICT` on orphan local branches.
- Port branch/checkout internals from `workspaceCreation.create` and `workspaceCreation.checkout` into the branch-source path.
- Port PR checkout internals from `workspaceCreation.checkout` PR path into the PR-source path. Server fetches PR metadata via `gh pr view`; caller passes only `pr: number`.
- `workspaceCreation.adopt` stays as a host-internal procedure for the modal "existing worktree" picker and the v1→v2 migration. Not exposed publicly.
- Server always runs `.superset/setup.sh` when present; returns the session in `terminals[]`.
- Add `agents.run` and `terminals.run` as separate procedures.
- `agents.run` resolves `agent` via host-local `HostAgentConfig` (instance id then preset id), finalizes prompt with attachment paths, spawns argv per the PR1 launch spec.
- Add `workspaces.aiRename({ workspaceId, prompt })` and `workspaces.generateBranchName({ projectId, prompt })`. Triggered by `autogenerateName: true` on `workspaces.create` (renderer-only flag, omitted from SDK/CLI/MCP types).
- Add `workspace_tasks` join table migration (cloud DB). Cloud-layer `workspaces.create` writes `taskIds` rows atomically. Add `workspaces.linkTask` and `workspaces.unlinkTask`.

Renderer cutover (rebuild the modal flow on the new API):

- New workspace modal uploads attachments to host on attach (via `attachments.upload`); stores `attachmentId`s in modal-local Zustand state.
- Submit calls `workspaces.create({...})` directly with the `agents` sugar populated when the user picked an agent. No pending row created.
- After success, renderer writes returned `terminals` + successful `agents` results into the workspace pane store via `addLaunchPanes(workspaceId, [...terminals, ...agents.filter(ok)])`, then navigates to `/v2-workspace/$workspaceId`.
- Task view's "open in workspace" / "run in workspace" flows build prompt Markdown in the UI (fetching task description, linked GitHub issue/PR content as needed), pass `taskIds` to link the workspace.
- Existing-worktree picker path in the modal calls the host-internal `adopt` procedure directly, same as today.

Drop the orchestration gunk in the same PR (the new flow doesn't need any of it):

- Pending route as create orchestrator: rebuild as a thin loading view around the create mutation, OR drop it entirely if the modal can show its own loading state. The state machine (`pending.intent` switch, `consumePendingLaunch` mount-effect, `dispatchForkLaunch`, `useConsumePendingLaunch`) is gone.
- `getProgress` polling and the progress-store machinery — gone. Create is a single promise; UI shows a spinner.
- IndexedDB attachment-blob storage for the modal — gone. Attachments upload directly to host now.
- `buildIntentPayload` / `buildForkAgentLaunch` / `buildCheckoutPayload` / `buildPrCheckoutPayload` / `buildAdoptPayload` — gone. The new modal builds one `workspaces.create` payload directly.
- `useCreateDashboardWorkspace` / `useCheckoutDashboardWorkspace` / `useAdoptWorktree` — collapsed into a single `useCreateWorkspace` hook (the existing-worktree adopt path stays as a separate hook against the host-internal procedure).
- Renderer-side launch building (turning agent configs + prompts into terminal command strings) — gone. Host-service owns argv now.
- Renderer-side attachment file writing into worktrees — gone. Attachments live in the host attachment store.

Other callers also flip in this PR:

- Automations call `workspaces.create({ ..., agents: [{ agent, prompt }] })` instead of `workspaceCreation.create` + separate dispatch. Automation run rows persist the returned workspace ID and per-entry session IDs.
- CLI calls `workspaces.create` and prints workspace/session IDs.
- MCP `create_workspace` tool routes to `workspaces.create`. The legacy `sourceWorkspaceId` convenience field is dropped — tool only supports `baseBranch`.

After PR4: every callsite uses the new API. The old `workspaceCreation.create/checkout/getProgress` procedures still exist in the router but nothing reaches them. `workspaceCreation.adopt` is still actively used (host-internal) and stays.

Tests:

- All four source flows produce the expected workspace (branch fork, branch checkout, PR checkout, internal adopt).
- Branch resolution prefers existing local/remote-tracking refs over forking.
- PR resolution uses `gh pr checkout` and handles cross-fork PRs.
- Orphan local branch throws `CONFLICT`.
- `agents` sugar runs independently per entry and surfaces per-entry results.
- Sugar agents still spawn against an `alreadyExists: true` workspace.
- `autogenerateName: true` triggers the AI rename background task.
- Setup terminal appears in `terminals[]` when present.
- Invalid `agent` (no matching config) fails the entry without failing the workspace.
- Attachment IDs resolve to prompt-block paths.
- `taskIds` writes the `workspace_tasks` join atomically.
- `linkTask` / `unlinkTask` are idempotent.
- New modal creates a workspace and opens the returned agent pane without going through `/pending/$pendingId`.
- Automation run creates workspace + session in one host call.
- CLI create prints IDs without renderer pane state.

### PR 5: Remove legacy create machinery

Goal: delete code that PR4 made unreachable. No behavior change.

Changes:

- Remove `workspaceCreation.create`, `workspaceCreation.checkout`, `workspaceCreation.getProgress` from the host-service router.
- Move remaining helpers (`searchBranches`, `generateBranchName`, GitHub issue/PR search/content) to their final routers (`workspaces`, `github`).
- Delete `dispatchForkLaunch` and the launch-building utilities under `pending/$pendingId/`.
- Remove pending-row columns: `terminalLaunch`, `chatLaunch`, `intent`, `runSetupScript`, anything else load-bearing only for the old flow. (Drizzle migration to drop the columns / table.)
- If the pending route was kept as a thin loading shim in PR4, decide whether to remove it entirely now. If nothing else depends on it, delete the route.
- Remove `useConsumePendingLaunch` if PR4 left a compatibility-only stub.
- Remove `linkedContext` and `composer` schemas from any leftover input types.
- Drop `applyAiWorkspaceRename` from `workspaceCreation.create` (it's now called from `workspaces.aiRename` instead).
- Remove `workspaceCreation` from `appRouter` once the file has nothing left.

Tests:

- No references remain to removed procedures or pending-row launch fields.
- All call sites still use only the new `workspaces.*` / `agents.*` / `terminals.*` / `attachments.*` surface.
- `workspaceCreation.adopt` stays callable (still used by modal + v1 migration).

## Testing

Host-service tests:

- `workspaces.create` covers all three public flows: branch fork, branch checkout, and PR checkout.
- The host-internal `adopt` procedure still registers existing worktrees correctly (modal + v1 migration paths).
- Branch resolution prefers existing local/remote-tracking refs over forking.
- PR resolution uses `gh pr checkout` and handles cross-fork PRs without manual remote setup.
- Orphan local branch (no Superset workspace) throws `CONFLICT` instead of silently overwriting.
- Multiple `agents` sugar entries start independently and surface per-entry results.
- Setup script, when present, appears in the response's `terminals[]`.
- `agents.run` and `terminals.run` work as standalone calls against existing workspaces.
- Attachment IDs resolve to host-readable paths used in prompts; invalid IDs fail the specific launch.
- `taskIds` on create writes `workspace_tasks` rows atomically with the workspace insert.

Renderer tests:

- Attachment upload stores only IDs and display metadata in local UI state.
- Host changes clear or reupload attachments.
- `terminals` and successful `agents` results are added to the workspace pane store before route mount.
- Duplicate session IDs focus existing panes instead of creating duplicates.
- Workspace route renders pre-populated pane state without consuming pending launch intent.

Integration tests:

- New workspace modal, task view, automations, MCP, and CLI all call the same create API.
- No create path depends on pending rows, query params, or workspace route effects.

## Assumptions

- Create is a promise-based mutation for v1.
- If durable progress is needed later, add `workspace.operations.*` rather than restoring renderer pending-row orchestration.
- Attachment IDs are host-scoped and invalid after switching hosts unless reuploaded.
- Superset cloud stores workspace/session metadata, not attachment bytes.
