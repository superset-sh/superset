# V2 Workspace Launch Context

Status as of PR #3467 (branch `v2-modal-agent-launch`). See
`plans/v2-workspace-context-composition.md` for the full design.

## What's implemented (phase 1)

V2 "fork" workspaces now compose a full agent launch from prompt + linked
issue/PR/task metadata + attachments. Closes Gaps 4 and 5 in
`V2_WORKSPACE_MODAL_GAPS.md`; Gaps 3 and 6 remain open.

### Pipeline (composition)

```
draft (modal)
  → PendingWorkspaceRow
    → buildForkAgentLaunch (pending page)
      ├─ buildLaunchSourcesFromPending      → LaunchSource[]
      ├─ buildLaunchContext                 → LaunchContext
      ├─ buildLaunchSpec                    → AgentLaunchSpec
      └─ consumer picks chat vs terminal based on the selected agent's kind
```

## Dispatch architecture (pending-row-as-bus)

Launch dispatch uses the **pending row as the transport** between the
pending page (producer) and the V2 workspace page (consumer). **Zero V1
primitives.** Same pattern V2 preset execution uses
(`useV2PresetExecution`): live-query a record, open a pane in the V2
`@superset/panes` store, and pass any terminal startup command as transient
pane data. `TerminalPane` attaches the PTY through the terminal WebSocket.

```
┌─────────────────────────────────────────────────────────────┐
│  Pending page                                               │
│                                                             │
│  1. host.workspaceCreation.create → workspace exists        │
│                                                             │
│  2. buildForkAgentLaunch(pending, attachments, configs)     │
│     uses the real workspaceId now that create resolved.     │
│                                                             │
│  3. Dispatch per agent kind:                                │
│                                                             │
│     kind == "terminal":                                     │
│       • for each attachment: workspaceTrpc.filesystem       │
│         .writeFile → <worktree>/.superset/attachments/…     │
│       • pendingRow.terminalLaunch = { command, name }       │
│                                                             │
│     kind == "chat":                                         │
│       • pendingRow.chatLaunch = {                           │
│           initialPrompt, initialFiles, model, taskSlug,     │
│         }                                                   │
│                                                             │
│  4. Navigate to /v2-workspace/<workspaceId>                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  V2 workspace page mount: useConsumePendingLaunch()         │
│                                                             │
│  live-query pendingRow by workspaceId                       │
│                                                             │
│  if row.terminalLaunch:                                     │
│    store.addTab({ panes: [{ kind:"terminal", … }] })        │
│    TerminalPane mounts → WebSocket open → initialCommand    │
│    update(row, { terminalLaunch: null })                    │
│                                                             │
│  if row.chatLaunch:                                         │
│    store.addChatTab({ initialPrompt, initialFiles, model }) │
│    ChatPane auto-sends on mount (existing V2 chat runtime)  │
│    update(row, { chatLaunch: null })                        │
└─────────────────────────────────────────────────────────────┘
```

### Why pending-row-as-bus

- **Durable**: pending row lives in the `pendingWorkspaces` collection.
  Intent survives renderer restarts; the user can close and reopen the
  app and the dispatch still fires the next time the workspace is
  visited.
- **Already tied to the workspace**: `pendingRow.workspaceId` is the
  natural key. No new zustand slice.
- **Producer/consumer decoupled**: pending page never touches the V2
  workspace store directly; workspace page never does the spec-build.
  Each side owns its own concern.
- **Consistent with V2 preset execution** — same "stash a record, live-
  query from the workspace page, open a pane" pattern is how
  `useV2PresetExecution` ships preset commands.
- **Path to host-owned dispatch** (phase 5): pending page stops
  populating `row.terminalLaunch`; instead passes the spec into
  `host.workspaceCreation.create`. Host returns the already-running
  terminal in `terminals[]`. Workspace page consumer stays — it now
  reads the host-returned terminal via live query instead of the
  pending row. Migration is local to the producer side; consumer never
  changes. Chat stays client-driven (chat runtime is in the renderer).

### Why not the V1 `WorkspaceInitEffects` bus

V1's dispatcher (`WorkspaceInitEffects` → `launchAgentSession` →
`terminal-adapter`) is hard-coded to V1's `useTabsStore` in the
orchestrator's default tabs adapter. V2 workspaces render panes from a
separate `@superset/panes` store, so launches dispatched through V1
land in a store V2 never reads — the command runs but no pane appears.
**V2 must own its launch dispatch.**

### Files (composition, stable)

- `shared/context/types.ts` — `LaunchSource`, `ContentPart`, `ContextSection`, `LaunchContext`, `AgentLaunchSpec`.
- `shared/context/composer.ts` — `buildLaunchContext` (parallel resolve, dedup, failure-tolerant).
- `shared/context/contributors/*` — one per source kind: `userPrompt`, `githubIssue`, `githubPr`, `internalTask`, `attachment`.
- `shared/context/buildLaunchSpec.ts` — agent-aware template rendering, inline-multimodal preservation.
- `routes/.../pending/$pendingId/buildForkAgentLaunch.ts` — pure helper that runs the composer + buildLaunchSpec from a `PendingWorkspaceRow`.

### Files (dispatch, to be reworked per the "pending-row-as-bus" plan)

The first wire-up attempt shipped through V1's `useWorkspaceInitStore` +
`WorkspaceInitEffects`. That path is being ripped out because V1's
orchestrator uses V1's `useTabsStore`, which V2 doesn't render from.

- `shared/context/buildAgentLaunchRequest.ts` — **deprecated once dispatch migrates.** Still useful as a reference for the V1 shape if we ever need it; otherwise removable after the pending-row-as-bus rewrite.
- `renderer/hooks/useEnqueueAgentLaunch/*` — **to be removed.** V1-bus primitive.
- `routes/.../pending/$pendingId/page.tsx` (the `enqueueAgentLaunch` call) — **to be replaced** by the kind-split described under "Dispatch architecture" above.

### Files (dispatch, to be added)

- `pendingWorkspaceSchema` in `providers/.../schema.ts` — gain `terminalLaunch?` and `chatLaunch?` optional fields.
- `routes/.../v2-workspace/$workspaceId/hooks/useConsumePendingLaunch/*` — mount-effect hook that live-queries the pending row, opens a pane via V2 `@superset/panes` store, writes the command via `workspaceTrpc`, clears the field.

### Agent templates

Both system and user templates are Mustache-rendered via
`renderPromptTemplate`. Variables: `{{userPrompt}}`, `{{tasks}}`,
`{{issues}}`, `{{prs}}`, `{{attachments}}`. System default is empty
(harnesses discover their own `AGENTS.md` / `CLAUDE.md`). User default
is markdown with the pre-rendered kind-blocks dropped in order. Users
can override per-agent in settings.

## Test plan

### Local manual smoke

1. `bun dev`, open the desktop app.
2. Create a V2 project if needed, ensure Claude (or another terminal
   agent) is enabled in Settings → Agents.
3. Open the V2 new-workspace modal (dashboard).

#### Scenarios

- [ ] **Prompt only**. Type "add a README". Submit. Workspace opens; Claude's terminal receives the prompt as an argv.
- [ ] **Prompt + attachment**. Drop a small text file. Submit. File lands at `<worktree>/.superset/attachments/<filename>`; prompt includes `- .superset/attachments/<filename>`.
- [ ] **Prompt + linked GitHub issue**. Link an issue via `@` mention. Submit. Prompt includes `# <issue title>`. (Body is empty — see known gaps.)
- [ ] **Prompt + linked task**. Link an internal task. Submit. Prompt includes `# Task <id> — <title>`; `taskSlug` in launch request matches task slug.
- [ ] **Prompt + linked PR**. Link a PR. Submit. Prompt includes `# <PR title>`.
- [ ] **Multiple sources** (prompt + task + issue + PR + attachment). Submit. All sections appear in the prompt in order. `taskSlug` = first internal-task slug.
- [ ] **Retry on failure**. Disable network, submit, fail; re-enable, hit retry button. Second attempt re-enqueues correctly (no stale setup lingers).

### Automated

- `bun test apps/desktop/src/shared/context/ apps/desktop/src/renderer/hooks/useEnqueueAgentLaunch/ apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/\$pendingId/` — **113 tests**, including composer dedup/ordering/failure, contributor 404-null semantics, Claude/codex snapshot rendering, bridge base64 encoding + filename dedup, pending-page source mapping, and the V1 fallback path.
- `bunx tsc --noEmit -p apps/desktop/tsconfig.json` — clean in the new surface area.

### Demo script

`apps/desktop/scripts/demo-launch-spec.ts` renders `AgentLaunchSpec`
across scenarios for any built-in agent. Run:
```bash
bun run scripts/demo-launch-spec.ts              # claude + codex + cursor-agent
bun run scripts/demo-launch-spec.ts claude       # just claude
```

## Known phase 1 gaps

- **Issue / PR / task bodies are not injected.** Host-service has no
  `getIssueContent` / `getPullRequestContent` / `getInternalTaskContent`
  endpoint yet, and the renderer refuses to fall back to the existing
  Electron procedure (we don't want Electron IPC in V2). The resolver
  stubs return empty bodies; agents see title + URL + task-slug only.
- **No agent picker in the V2 modal.** `getFallbackAgentId` chooses
  (prefers Claude, falls back to first enabled). Settings-level
  overrides are respected.
- **Remote hosts** (`hostTarget.kind === "remote"`) — launch enqueue
  still runs client-side via `useWorkspaceInitStore`. Remote terminals
  are out of scope for phase 1; no regression because V2 doesn't
  support remote agent launch today.
- **Base64 round-trip on attachments.** IndexedDB store → data URL →
  `Uint8Array` (V2 pipeline) → base64 data URL (V1 wire). Functional
  but wasteful; bytes-over-IPC is a later optimization.
- **No host-service-side launch.** Phase 1 launches via V1 renderer
  adapters. For remote host support, host-service needs its own
  `executeAgentLaunch` mirror.

## Known footguns to revisit (post-testing cleanup)

Caught during manual testing, not currently biting us, but worth
fixing before the dispatch rewrite is considered done:

1. **Deep solve for binary transport.** Current fix for the
   `PromptInput` blob-URL revoke race (commit 33730ff01) honors the
   library's contract — uses the `message.files` passed into
   `onSubmit` (already converted to data URLs) instead of re-reading
   provider state. Works correctly but still transports bytes as
   base64 strings across layers. The deep solve is to flow `File` /
   `Blob` objects end-to-end; URLs stay pure UI preview concerns.
   Library-level change to `@superset/ui/ai-elements/prompt-input`
   (`FileUIPart & { file: File }` through the provider) + downstream
   `ChatLaunchConfig.initialFiles: { file: Blob, ... }[]` + bytes
   branch for `workspaceTrpc.filesystem.writeFile`. Touches V1, V2,
   chat, and every consumer — deliberate staged PR, not a quick fix.

2. **Reload-mid-launch can create a new terminal ID.**
   `consumeTerminalLaunch` calls `crypto.randomUUID()` for `terminalId`
   each time it fires. If the user reloads the app between
   `terminalLaunch` being applied to the pending row and the consume
   clearing it, the fresh consume can generate a new terminal ID. Fix:
   store the `terminalId` on `PendingTerminalLaunch` itself (generate
   once in `dispatchForkLaunch`).

3. **Silent failure in the consume hook.** `addTab` failures
   `console.warn` and return — user sees no pane open and no error UI.
   Wrap in try/toast with the error message. Low urgency while
   `[v2-launch]` debug logs are present; becomes visible when those are
   removed.

4. **`joinPath` assumes POSIX separators.** Fine on Mac/Linux hosts
   where the worktree paths come from. When remote-host launch lands
   (phase 5) and we get Windows hosts, this breaks. Swap for a
   proper cross-platform join (or just use `path-browserify`).

5. **Schema coupling between old and new IDB stores.** Dexie opened
   the hand-rolled store's existing DB (`superset-pending-attachments`,
   version 1) transparently. Any future schema change (indices,
   migration) requires bumping the Dexie version and writing a
   migration step.

6. **`PendingTerminalLaunch.attachmentNames` is populated but never
   read by the consume hook.** Currently informational. Either drop
   the field, or use it for a UI "files attached" hint in the
   workspace-creation success toast.

7. **Remove the `[v2-launch]` debug logs** from `dispatchForkLaunch`,
   `useConsumePendingLaunch`, and `useSubmitWorkspace` once the
   end-to-end flow is stable. Replace with a single structured
   `captureEvent` call at the pane-opened milestone.

## Follow-ups (roughly in priority order)

0. **Rewrite dispatch to pending-row-as-bus** (blocking phase-1 ship —
   current V1-bus dispatch is broken for V2). See "Dispatch architecture"
   above. Mirrors `useV2PresetExecution`. Estimated 3-4 hours:
   - Schema: `terminalLaunch?` + `chatLaunch?` on `pendingWorkspaceSchema`.
   - Producer: pending page populates one of those fields after `create`
     resolves, writes attachments via `workspaceTrpc.filesystem`.
   - Consumer: new `useConsumePendingLaunch(workspaceId, store)` mount
     effect on the V2 workspace page. Opens pane in V2 store, writes
     command via `workspaceTrpc.terminal`, clears the field.
   - Rip out: `useEnqueueAgentLaunch` + its call. `buildAgentLaunchRequest`
     stays for now as a reference but is no longer imported.
1. **Host-service body endpoints** (`getIssueContent` /
   `getPullRequestContent` / `getInternalTaskContent`). Swap the
   resolver stubs in `buildForkAgentLaunch.ts` → contributors emit real
   body markdown → agents see full context. Unblocks full Gap 4.
2. **Gap 3: AI branch name generation.** `workspaces.generateBranchName`
   call before submit; 30s timeout; fallback to slug preview.
3. **Gap 6: create-from-PR flow.** Detect `github-pr` source and route
   to a different host-service mutation that creates the workspace from
   the PR's head branch. Today the PR is treated as context only.
4. **V2 modal agent picker.** Minimum: a display pill showing the
   default agent with a click-through to settings. Full: a picker
   inline in the modal matching V1's UX.
5. **Bytes transport.** IndexedDB stores `Blob`; pipeline passes
   `Uint8Array` over IPC via SuperJSON; adapters gain
   `filesystem.writeFile({kind:"bytes"})`. Eliminates the base64
   round-trip.
6. **Anthropic Files API** for chat agents only. Upload once, reference
   by file ID across launches. Smaller payloads, server-side caching.
   Requires chat-runtime changes; does not apply to CLI agents.
7. **Remote host launch.** Host-service-side `executeAgentLaunch` so
   workspaces on remote hosts can launch agents without renderer
   involvement. Unblocks remote-first workflows.
8. **Per-kind XML wrapping for Claude** (optional). Extend
   `renderPromptTemplate` with Mustache-style conditional sections
   (`{{#issues}}...{{/issues}}`) and ship a Claude-XML default that
   wraps non-empty blocks in tags. Currently defaults are plain
   markdown; users can override in settings.

## File layout reference

```
apps/desktop/src/
  shared/context/
    types.ts
    composer.ts                  composer.integration.test.ts
    composer.test.ts
    buildLaunchSpec.ts           buildLaunchSpec.test.ts
    buildAgentLaunchRequest.ts   buildAgentLaunchRequest.test.ts
    __fixtures__/
      attachment.logs-txt.ts
      githubIssue.auth-middleware.ts
      githubPr.auth-rewrite.ts
      internalTask.refactor-auth.ts
      launchContext.multi-source.ts
      launchContext.prompt-only.ts
      index.ts
    contributors/
      userPrompt.ts              userPrompt.test.ts
      attachment.ts              attachment.test.ts
      githubIssue.ts             githubIssue.test.ts
      githubPr.ts                githubPr.test.ts
      internalTask.ts            internalTask.test.ts
      index.ts
  renderer/hooks/useEnqueueAgentLaunch/
    useEnqueueAgentLaunch.ts     useEnqueueAgentLaunch.test.ts
    index.ts
  renderer/routes/_authenticated/_dashboard/pending/$pendingId/
    page.tsx                     (wires enqueue)
    buildForkAgentLaunch.ts      buildForkAgentLaunch.test.ts

packages/shared/src/
  agent-definition.ts            (contextPromptTemplateSystem/User fields)
  agent-catalog.ts               (builtin chat agent defaults)
  agent-prompt-template.ts       (renderPromptTemplate + context vars + defaults)
  builtin-terminal-agents.ts     (builtin terminal agent defaults)

packages/local-db/src/schema/
  zod.ts                         (contextPromptTemplate* in preset + custom schemas)
```
