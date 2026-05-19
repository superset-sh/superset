# Canonical Workspace Create Flow

## Summary

Workspace creation should be a single host-service orchestration flow. Today the renderer drives too much of the lifecycle: it creates a pending row, creates or checks out the workspace, loads attachments, builds launch prompts, writes attachment files, stores transient launch intent, navigates, and then relies on the workspace route mounting to actually start or reveal work.

The target is to move workspace creation and runtime startup behind one `workspace.create()` API. The renderer uploads attachments separately, calls `workspace.create()`, writes returned launch panes into the workspace pane store, and navigates. The workspace route renders existing pane state; it does not start agents or populate panes as a side effect of mounting.

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

Replace the current narrow `workspace.create({ projectId, name, branch })` with:

```ts
workspace.create({
  mode:
    | {
        kind: "fork";
        branchName: string;
        baseBranch?: string;
        baseBranchSource?: "local" | "remote-tracking";
      }
    | { kind: "checkout"; branchName: string }
    | { kind: "pr-checkout"; prNumber: number }
    | { kind: "adopt"; branchName: string; worktreePath?: string },

  projectId: string,
  name: string,

  launches?: Array<
    | { kind: "terminal"; command: string; label?: string }
    | {
        kind: "agent";
        agentId: string;
        prompt?: string;
        attachmentIds?: string[];
      }
  >,
}) => {
  workspace: { id, projectId, name, branch },
  launches: Array<
    | { kind: "terminal"; terminalId: string; label?: string }
    | { kind: "chat"; chatSessionId: string; label?: string }
  >,
  warnings: string[],
}
```

Notes:

- `prompt` is plain Markdown on each requested agent launch.
- `attachmentIds` belong to the agent launch that needs them.
- Setup is not a public input. If `.superset/setup.sh` exists, host-service starts it and returns it as a terminal launch.
- Attachment paths are not returned to the UI.

## Host-Service Flow

`workspace.create()` owns the full server-side flow:

1. Resolve the local project/repo.
2. Execute the requested workspace mode:
   - `fork`: create a new branch/worktree from base branch.
   - `checkout`: check out an existing branch into a workspace.
   - `pr-checkout`: check out a GitHub PR branch.
   - `adopt`: register an existing worktree.
3. Register the host and cloud workspace row.
4. Persist the local host workspace row.
5. Build an internal launch list:
   - setup terminal if `.superset/setup.sh` exists;
   - all requested terminal launches;
   - all requested agent launches.
6. For each agent launch:
   - resolve the selected agent config;
   - resolve `attachmentIds` to host-readable paths;
   - append a deterministic attachment block to the Markdown prompt;
   - start either a terminal-backed or chat-backed session.
7. Return the workspace row, all launched session IDs, and warnings.

Attachment prompt block for terminal agents should reference absolute host paths, for example:

```md
# Attached files

The user attached these files. They are available on this host at:

- /Users/satya/.superset/attachments/<attachmentId>/<attachmentId>.png
```

## Renderer Flow

Interactive UI flows should work like this:

1. User selects a target host.
2. User attaches files.
3. Renderer immediately calls `attachments.upload()` on the selected host.
4. Renderer stores `attachmentId` plus display metadata in local Zustand state.
5. If the selected host changes, clear or reupload attachments.
6. On submit, renderer calls `workspace.create()` with the requested mode and launches.
7. After create resolves, renderer writes returned launches into the workspace pane store.
8. Renderer navigates to `/v2-workspace/$workspaceId`.

The workspace route should only render the existing pane store. It should not be required to start agents, consume pending launch intent, or populate panes as a side effect of mounting.

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
- add terminal panes for returned `terminalId`s;
- add chat panes for returned `chatSessionId`s;
- dedupe by session ID;
- focus the created or existing pane.

## Prompt Building Boundary

Prompt templates are separate from workspace creation.

The create API accepts user-editable Markdown on each agent launch:

```ts
{ kind: "agent", agentId, prompt, attachmentIds }
```

Template systems can generate that Markdown before submit, and users can edit it freely. `workspace.create()` does not need to know whether the prompt came from a saved template, a task view button, an automation, CLI input, or manual typing.

Host-service owns only runtime prompt finalization:

- resolve attachment IDs to readable host paths;
- append the attachment block;
- adapt the prompt for the selected terminal/chat agent config;
- start the session.

This keeps semantic prompt authoring host-independent while keeping host-local paths host-owned.

## Prompt Builder Design

The prompt builder should be split into two responsibilities:

1. Template rendering before create.
2. Runtime prompt finalization during create.

### Template Rendering

Templates produce Markdown. They are not part of the `workspace.create()` contract.

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

For each requested agent launch, host-service receives:

```ts
{
  kind: "agent",
  agentId: string,
  prompt?: string,
  attachmentIds?: string[],
}
```

Host-service then:

- loads the selected agent config;
- resolves whether the agent is terminal-backed or chat-backed;
- resolves each `attachmentId` from the selected host's attachment store;
- adds an attachment section to the prompt when attachments exist;
- adapts the final prompt for the selected agent runtime;
- starts the terminal or chat session.

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

Agent configs should be host-local launch profiles for v1. They encode real runtime and security preferences: CLI flags, approval mode, sandboxing behavior, model selection, and command templates. Those preferences can reasonably differ per machine.

Responsibilities:

- Product/settings UI owns editing agent profiles on the selected/local host.
- Host-local settings own persistence.
- Host-service owns runtime validation and execution.
- Renderer should pass `agentId`, not reconstruct command flags.

For v1, `agentId` means "the agent profile with this ID on the selected host." If another host does not have the same profile, that host cannot launch it. Cross-device synced agent profiles can be a later product decision.

For `workspace.create()`, an agent launch should require a prompt. If the caller wants a promptless process, it should use a raw terminal launch:

```ts
{ kind: "terminal", command: "claude", label: "Claude" }
```

That lets agent profiles focus on one job: "given a Markdown prompt, how does this host start this agent?"

The host-local config model should be a list of configured preset instances. Hardcoded presets provide defaults and icons. Stored entries represent the agents this host actually exposes.

```ts
type HostAgentSettings = {
  version: 1;
  agents: Array<{
    // Config instance id. Multiple entries may use the same presetId.
    id: string;
    // Hardcoded preset id, e.g. "claude", "codex", "custom-terminal".
    presetId: string;

    // Optional overrides. Missing values resolve from the preset.
    label?: string;
    launchCommand?: string;
    promptInput?: "argv" | "stdin";

    order: number;
  }>;
};
```

Resolved runtime shape:

```ts
type ResolvedHostAgentConfig = {
  id: string;
  presetId: string;
  kind: "terminal";
  label: string;
  description?: string;
  launchCommand: string;
  promptInput: "argv" | "stdin";
  order: number;
};
```

Configured entries are the available agents. Removing an entry removes it from the picker. Adding an entry creates a new instance from a hardcoded preset. Reordering edits `order`.

Superset Chat should not be part of this host-local terminal agent config model for v1. It can still appear as a launch option, but its model/provider behavior should stay in chat/model settings. We can skip additional Superset Chat configuration in this refactor.

Icons should not be stored in config for v1. The UI resolves icons from `presetId`. Builtins get branded icons; custom terminal entries get a generic terminal/custom icon.

This removes the need for both `command` and `promptCommand` in the create flow. The old distinction exists because some surfaces can open an agent with no prompt, while other surfaces launch with a prompt. In the new workspace create contract:

- `agent` launches are prompted and use `launchCommand`.
- promptless/manual commands are represented as `{ kind: "terminal", command }`.
- `launchCommand` is everything before the prompt. For `argv`, host-service appends the prompt argument. For `stdin`, host-service pipes the prompt through stdin.

Based on current builtins:

- Claude, Gemini, Mastracode, Pi, and Cursor can use their normal prompt-aware command with argv input.
- Amp needs stdin prompt input.
- Codex, OpenCode, and Copilot need prompt-specific CLI flags, which become their `launchCommand`.
- None of the current builtins need trailing arguments after the prompt, so no `launchCommandSuffix` is needed.

Do not include a file-based prompt input mode in v1. It may be useful later for CLIs with native `--prompt-file` support or for avoiding shell argument limits, but none of the current builtins require it and the existing prompt transport enum only supports `argv` and `stdin`.

The current code does have `buildPromptFileCommandString(filePath, ...)`, but that is not a file transport mode. It reads an existing prompt file and still passes the resulting prompt through `argv` or `stdin`.

Host-service should validate:

- the agent config exists and is enabled;
- the requested agent kind is supported on that host;
- required commands/providers are available;
- command templates and CLI flags are well-formed;
- prompt input mode is supported.

If an agent command/provider is unavailable on that host, `workspace.create()` should fail that specific launch clearly or return a warning when other launches can continue.

Security boundary:

- User-owned configs may run user-configured commands on that user's host.
- Host-local capabilities, paths, tokens, and installed tools remain host-owned and are never assumed from synced config alone.

The invariant should be:

> The same `agentId` is only stable within a host. The renderer selects from the target host's available profiles; host-service resolves that profile and launches it.

## Router Migration

`workspaceCreation` should be deprecated, not extended.

Move current create behavior into `workspace.create()`:

- `workspaceCreation.create` fork behavior;
- `workspaceCreation.checkout` branch checkout behavior;
- `workspaceCreation.checkout` PR checkout behavior;
- `workspaceCreation.adopt` adopt behavior.

Keep existing `workspace.get`, `workspace.gitStatus`, and `workspace.delete`.

Move or delete remaining `workspaceCreation` helpers:

- `getProgress`: delete; create is promise-based for v1.
- `searchBranches`: move to `project` or `workspace`.
- `generateBranchName`: move to `workspace`.
- GitHub issue/PR search and content helpers: move to `github` or a context-oriented router.
- `getContext`: delete if no new caller needs it.

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
- call `workspace.create()` on submit;
- show loading while the create promise is in flight;
- write returned launches to the workspace pane store;
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

Automations should call the same `workspace.create()` endpoint with requested launches instead of doing:

1. workspace create;
2. separate chat or terminal dispatch;
3. separate run-row session wiring.

The automation run row should persist the returned workspace ID and launch IDs.

CLI should call the same endpoint and print the returned workspace and session IDs. It does not need pane store logic.

## PR Boundaries And Implementation Order

This should be split into several PRs. The safest order is to move ownership one boundary at a time and keep old flows working until the replacement path is complete.

### PR 1: Host-Local Agent Config Model

Goal: introduce the new configured-agent-instance model without changing workspace creation.

Changes:

- Add hardcoded terminal agent presets with `presetId`, label, description, default `launchCommand`, default `promptInput`, and UI icon mapping.
- Add host-local storage for `HostAgentSettings { version, agents }`.
- Add host-service/settings APIs to list, add, update, remove, and reorder configured agents.
- Migrate existing builtin overrides/custom agents into configured entries, preserving current enabled agents and command edits.
- Keep existing renderer consumers working by exposing resolved configs in the current `ResolvedAgentConfig`-compatible shape where needed.

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

### PR 4: New `workspace.create()` API

Goal: add canonical host-service orchestration while leaving `workspaceCreation` in place.

Changes:

- Add the new `workspace.create()` input/output shape.
- Port fork, checkout, PR checkout, and adopt internals from `workspaceCreation`.
- Start setup terminal automatically when `.superset/setup.sh` exists.
- Start requested raw terminal launches.
- Start requested agent launches by resolving host-local agent config, finalizing prompt with host attachment paths, and creating terminal sessions.
- Return `workspace`, `launches`, and `warnings`.

Tests:

- all modes create/adopt the expected workspace;
- multiple launches start for one workspace;
- setup launch is included when setup script exists;
- invalid agent IDs fail clearly;
- attachment IDs are resolved into prompt text.

### PR 5: Migrate Interactive Create UI

Goal: move the new workspace modal/task entrypoints onto the new create flow.

Changes:

- New workspace modal uploads attachments to host on attach.
- Submit calls `workspace.create()` directly.
- After success, call `addLaunchPanes()` and navigate.
- Remove create-flow use of pending rows, pending route, IndexedDB attachment blobs, and renderer-side launch building for migrated entrypoints.
- Task view/open-in-workspace flows build semantic Markdown in the UI and call the same endpoint.

Tests:

- modal creates workspace and opens returned agent pane;
- attachments appear in terminal prompt as host-local paths;
- task launch creates prompt Markdown in UI and launches via host-service;
- route mount is not required to start the agent.

### PR 6: Migrate Automations And CLI

Goal: make non-renderer callers use the same create API.

Changes:

- Automations call `workspace.create()` with requested launches instead of create plus separate dispatch.
- Automation run rows persist returned workspace ID and launch IDs.
- CLI calls `workspace.create()` and prints workspace/session IDs.

Tests:

- automation run creates workspace and session through one host call;
- CLI create works without renderer pane state.

### PR 7: Remove Legacy Creation Machinery

Goal: delete the old orchestration path after all callers migrate.

Changes:

- Remove `workspaceCreation.create`, `checkout`, `adopt`, and `getProgress`.
- Move remaining picker/search helpers to their final routers.
- Remove `dispatchForkLaunch`.
- Remove pending row `terminalLaunch` / `chatLaunch`.
- Remove pending route create orchestration.
- Remove renderer-side terminal command construction and attachment writing for create flows.

Tests:

- no references remain to removed procedures;
- full create flows still pass across modal, task, automation, and CLI.

## Testing

Host-service tests:

- `workspace.create` works for `fork`, `checkout`, `pr-checkout`, and `adopt`.
- multiple requested launches start for one workspace.
- setup script, when present, returns as a terminal launch.
- agent sessions start without renderer navigation.
- attachment IDs resolve to host-readable paths used in prompts.
- invalid attachment IDs fail the relevant agent launch clearly.
- raw terminal launch starts the requested command.

Renderer tests:

- attachment upload stores only IDs and display metadata in local UI state.
- host changes clear or reupload attachments.
- create result launches are added to the workspace pane store before route mount.
- duplicate launch IDs focus existing panes instead of creating duplicates.
- workspace route renders pre-populated pane state without consuming pending launch intent.

Integration tests:

- new workspace modal, task view, automations, and CLI can call the same create API.
- no create path depends on pending rows, query params, or workspace route effects.

## Assumptions

- Create is a promise-based mutation for v1.
- If durable progress is needed later, add `workspace.operations.*` rather than restoring renderer pending-row orchestration.
- Attachment IDs are host-scoped and invalid after switching hosts unless reuploaded.
- Superset cloud stores workspace/session metadata, not attachment bytes.
