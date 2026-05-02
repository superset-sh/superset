# PR 4 Plan: Canonical `workspace.create()` returns launches

## Summary

Move the agent-launch decision and session start from the renderer's
post-create dispatch into `workspaceCreation.create` itself. The host
returns `launches: LaunchResult[]` describing already-started sessions,
and the pending page calls `addLaunchPanes(workspaceId, launches)`
(landed in PR 3) before navigating. Eliminates the
`pendingWorkspaces.terminalLaunch` / `chatLaunch` write side and the
mount-effect consumer; the `pendingWorkspaces` columns themselves are
removed in PR 5.

This PR is the first real consumer of `addLaunchPanes`. After PR 4:
- `workspaceCreation.create` is a **single round-trip**. No follow-up
  `dispatchForkLaunch` step.
- The renderer is **no longer responsible for picking the agent**
  preset, building the agent command, writing attachments, or minting
  terminal IDs. All of that lives in host-service.
- `useConsumePendingLaunch` becomes a permanent no-op (rows never get
  `terminalLaunch`/`chatLaunch` set anymore). Removal lives in PR 5.

## Why this PR exists

The 7-PR canonical-create plan replaces a chain of renderer-driven
side effects with a single host call. PRs 1–3 built the substrate:

- **PR 1** moved agent presets onto host-service so any host caller can
  resolve them (`settings.getAgentPresets`).
- **PR 2** moved attachments onto host-service so any host caller can
  read/write attachment bytes by ID.
- **PR 3** built the pane registry so panes can be written before — or
  without — the workspace route mounting.

PR 4 ties them together. The renderer hands the host a description of
the create intent (project, branch hints, prompt, agent ID, attachment
IDs, linked context); the host runs the worktree creation, picks the
agent preset, writes attachments into the worktree, starts the terminal
or chat session, and returns the workspace plus the started sessions.
The pending page then attaches.

## Scope

**In:**
- New host-side `launches: LaunchResult[]` field on the `create`
  response (and the `checkout` / pr-checkout response, since the modal
  uses the same dispatch path for fork + pr-checkout).
- Host-service: port `buildForkAgentLaunch` logic (renderer →
  host-service), pick agent preset by `composer.agentId`, build the
  command (terminal) or chat-launch config (chat), start the
  terminal/chat session, return descriptors.
- Host-service: write attachments into the worktree as part of create
  using PR 2's attachment store (resolve by attachment ID, not base64
  bytes on the wire).
- Renderer: pending page calls `addLaunchPanes(workspaceId, launches)`
  immediately after create resolves; stops calling `dispatchForkLaunch`
  and stops writing `terminalLaunch` / `chatLaunch` on the row.
- Renderer: modal switches from "send attachment bytes inline" to
  "upload attachments to host first, send IDs in `linkedContext`".

**Out (lives in PR 5):**
- Removing `pendingWorkspaces.terminalLaunch` / `chatLaunch` columns.
- Removing `useConsumePendingLaunch` hook.
- Removing `dispatchForkLaunch` / `buildForkAgentLaunch` files.
- Removing `pending-attachment-store` (renderer-side electron storage
  of pending attachments).

PR 4 leaves all of those in place and dormant so the diff is the bare
minimum needed to swap the dispatch path. PR 5 reaps.

**Out (lives in PR 6):**
- Migrating CLI / automations onto the same `create` endpoint.

## Architecture

### New shared type: `LaunchResult`

```ts
// packages/shared/src/launches.ts (or co-located)
export type LaunchResult =
  | { kind: "terminal"; terminalId: string; label?: string }
  | { kind: "chat"; chatSessionId: string; label?: string };
```

Used as the contract between host-service create and the renderer's
`addLaunchPanes`. Identical to the type in
`packages/desktop-renderer/.../addLaunchPanes.ts`.

### Host create response shape

```ts
return {
  workspace: cloudRow,
  launches: LaunchResult[],   // NEW — replaces post-create dispatch
  terminals: TerminalDescriptor[],   // KEPT for setup terminal — see below
  warnings: string[],
};
```

Setup terminal: continues to return as `terminals[0]` AND as a
`{ kind: "terminal", terminalId, label: "Setup" }` entry in `launches`.
Separate fields because (a) `terminals` is used for non-pane reporting
elsewhere and (b) the setup terminal should land in a pane like any
other launch. PR 5 collapses this when the legacy consumers are gone.

### Host-side launch building

New module: `packages/host-service/src/trpc/router/workspace-creation/shared/launches/`.

```
launches/
├── build-agent-launch.ts        # agentId + composer → command/chat config
├── start-terminal-launch.ts     # spawn PTY, return terminalId
├── start-chat-launch.ts         # create chat session, return sessionId
├── write-attachments.ts         # resolve attachment IDs → worktree files
└── index.ts
```

`build-agent-launch.ts` ports `buildForkAgentLaunch` from the renderer
(`apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/buildForkAgentLaunch.ts`).
Host-service version reads agent presets from the host's local DB
(PR 1's `settings.agent_configs` table) instead of the electron tRPC
preset table.

`write-attachments.ts` uses PR 2's attachment store: takes a list of
attachment IDs from `composer.linkedContext.attachmentIds`, reads each
from the host attachment store, writes to
`<worktree>/.superset/attachments/<filename>`. Replaces the renderer's
`writeAttachmentsToWorktree` helper.

### Host create flow (post-PR 4)

```
ensureMainWorkspace
  ↓
deduplicateBranchName + worktree add
  ↓
register cloud row + local workspaces row
  ↓
fire-and-forget AI rename
  ↓
[NEW] writeAttachmentsToWorktree (if linkedContext.attachmentIds)
  ↓
[NEW] buildAgentLaunch (if composer.agentId)
  ↓
[NEW] startTerminalLaunch / startChatLaunch
  ↓
[KEPT] startSetupTerminalIfPresent (if runSetupScript) — also pushed
       into launches[]
  ↓
return { workspace, launches, terminals, warnings }
```

### Input schema additions

```ts
createInputSchema = z.object({
  ...existing,
  composer: z.object({
    ...existing,
    agentId: z.string().optional(),   // NEW — agent preset ID to launch
  }),
  linkedContext: z.object({
    ...existing,
    attachmentIds: z.array(z.string().uuid()).optional(),   // NEW
    // attachments (base64 inline) stays for now — drop in PR 5
  }).optional(),
});
```

`agentId` matches today's `pending.agentId` (the picker stores it on
the row). The renderer reads it from `pending` and passes it through.

### Pending page changes

```ts
// before
const result = await createWorkspace(buildForkPayload(...));
ensureWorkspaceInSidebar(result.workspace.id, projectId);
await dispatchForkLaunch({ ...stashes on row });
collections.pendingWorkspaces.update(... { status: "succeeded" });

// after
const result = await createWorkspace(buildForkPayload(...));
ensureWorkspaceInSidebar(result.workspace.id, projectId);
addLaunchPanes(result.workspace.id, result.launches);
collections.pendingWorkspaces.update(... { status: "succeeded" });
```

`buildForkPayload` changes: stops attaching `loadedAttachments` (base64
bytes), instead uploads them to host via `attachments.upload` (PR 2)
and attaches the returned IDs to `linkedContext.attachmentIds`.

The pr-checkout branch threads `agentId` and `linkedContext.attachmentIds`
through `buildPrCheckoutPayload` the same way.

### Pane registry init at create time

Today the registry initializes inside `CollectionsProvider`'s `useMemo`,
which runs when the auth/org context renders. The pending page is also
rendered inside that provider, so by the time
`addLaunchPanes(workspaceId, ...)` is called, the registry is already
initialized. No new boot ordering required.

## Files Changed

**New:**
- `packages/host-service/src/trpc/router/workspace-creation/shared/launches/build-agent-launch.ts`
- `packages/host-service/src/trpc/router/workspace-creation/shared/launches/start-terminal-launch.ts`
- `packages/host-service/src/trpc/router/workspace-creation/shared/launches/start-chat-launch.ts`
- `packages/host-service/src/trpc/router/workspace-creation/shared/launches/write-attachments.ts`
- `packages/host-service/src/trpc/router/workspace-creation/shared/launches/index.ts`
- `packages/shared/src/launches.ts`
- Tests for each new module.

**Modified:**
- `packages/host-service/src/trpc/router/workspace-creation/procedures/create.ts` — call new launches helpers, return `launches`.
- `packages/host-service/src/trpc/router/workspace-creation/procedures/checkout.ts` — same.
- `packages/host-service/src/trpc/router/workspace-creation/schemas.ts` — add `composer.agentId`, `linkedContext.attachmentIds`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx` — drop dispatchForkLaunch call site, add `addLaunchPanes` call site.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/buildIntentPayload.ts` — upload attachments via `attachments.upload`, send `attachmentIds` instead of inline base64 (for fork + pr-checkout payloads).
- `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useCreateDashboardWorkspace/useCreateDashboardWorkspace.ts` — extend `CreateWorkspaceInput` type with `agentId` + `attachmentIds`.

**Untouched (removed in PR 5):**
- `useConsumePendingLaunch` — left in place; will no-op since rows won't get launch data set.
- `dispatchForkLaunch` / `buildForkAgentLaunch` — left in place but unreachable from the pending page.

## Tests

Host-service:
- `build-agent-launch` resolves a preset by ID, produces the right
  command for terminal preset, the right `ChatLaunchConfig` for chat
  preset.
- `start-terminal-launch` spawns a PTY, returns a non-empty terminalId,
  registers the session in `runtime/terminals`.
- `start-chat-launch` creates a chat session, returns sessionId,
  carries `initialPrompt` / `initialFiles` through.
- `write-attachments` resolves IDs from PR 2's store, writes files to
  `<worktree>/.superset/attachments/`.
- `create` integration: input with `composer.agentId="codex"` returns
  `launches: [{ kind: "terminal", terminalId, label: "Codex" }]` and
  the terminal session is reachable via `terminals.attach`.
- `create` integration: input with no `composer.agentId` returns
  `launches: []` (or just setup terminal if present).

Renderer:
- Pending page calls `addLaunchPanes` with the host's returned
  `launches` array on success.
- Pending page does **not** write `terminalLaunch` / `chatLaunch` to
  the row when intent is `fork` or `pr-checkout`.
- Existing `useConsumePendingLaunch` stays inert when row has no
  launch fields (regression check).

## Risks and Rollout

- **Behavior change: agent launches now happen server-side.** A bug in
  `build-agent-launch` (e.g. wrong env, wrong cwd) surfaces as "agent
  spawned but didn't behave as expected" instead of "renderer wrote
  bad command into terminal." Mitigated by porting the existing logic
  rather than rewriting, and by integration tests that compare
  produced commands against the renderer's output for the same
  presets.
- **Attachment ID flow.** PR 2 added the upload endpoint but no
  caller. PR 4 is the first real consumer. If `attachments.upload`
  has a bug (e.g. dropping mediaType), it surfaces here. Mitigated by
  PR 2's tests covering round-trip; add an end-to-end test in PR 4
  too.
- **Setup terminal duplication.** Returning the setup terminal in both
  `terminals` and `launches` makes both paths work simultaneously,
  but means the setup terminal could land twice if a caller dedupes
  poorly. The pending page only consumes `launches` — `terminals` is
  reported elsewhere. Risk is low but real.
- **Chat session lifecycle.** Chat sessions today are created lazily
  on first user message. Pre-creating in `start-chat-launch` means
  there's now an empty chat row in the DB at create time, even if the
  user never sends a message. Need to confirm chat session reaper
  handles this; if not, add to PR 4 scope.
- **No rollback strategy yet for partial-launch failure.** If
  `worktree add` succeeds, `start-terminal-launch` fails, what does
  the user see? Today the renderer eats this in a try/catch and
  toasts. PR 4 should do the same in the host: if a launch fails,
  push a `warnings[]` entry, return `launches: []`, leave the
  workspace alive. The renderer toasts the warning.

## Follow-Ups (PR 5)

- Drop `pendingWorkspaces.terminalLaunch` / `chatLaunch` columns from
  `dashboardSidebarLocal/schema.ts`.
- Delete `useConsumePendingLaunch`, `dispatchForkLaunch`,
  `buildForkAgentLaunch`, `pending-attachment-store`,
  `writeAttachmentsToWorktree`.
- Drop `linkedContext.attachments` (base64) from the create schema.
- Collapse host-side `terminals` / `launches` duplication.

## Decisions (confirmed via /decide)

1. **Agent preset selection.** Renderer passes `composer.agentId`;
   host resolves the preset from PR 1's `host_agent_configs` table.
   Future CLI / automation callers don't need to know how presets
   work. **PR 4 extends PR 1's schema with template columns** (see
   decision 5) so the host can build the full prompt itself, not
   just `[command, ...args, prompt]`.
2. **Launches shape.** Always `launches: LaunchResult[]`. Today emits
   0 or 1 agent launches plus an optional setup launch; future
   multi-pane create needs no schema change.
3. **Attachments.** First real consumer of PR 2's `attachments.upload`.
   Renderer uploads bytes, sends IDs as `linkedContext.attachmentIds`,
   host writes to worktree. Upload happens at the pending-page
   call-site (keeps `useCreateDashboardWorkspace` thin).
5. **Templates stay as shared-package constants (no per-preset
   columns).** PR 4's host-side launch builder synthesizes a
   `ResolvedAgentConfig` inline using
   `DEFAULT_CONTEXT_PROMPT_TEMPLATE_*` from `@superset/shared`, then
   passes it to `buildLaunchSpec`. No new columns on
   `host_agent_configs`. Per-preset template customization will get
   its own storage flow when an actual product use case motivates it
   — premature columns add migration cost and row-level duplication
   (9 rows × 3 templates) for zero current benefit. We **also
   deliberately do not port** V1's `promptCommand` /
   `promptCommandSuffix` shell-string escape hatches — pure
   argv-array spawn (`[command, ...args, ...(prompt ? promptArgs :
   [])]`) plus stdin transport covers every builtin. Mastracode
   moves to stdin transport (`prompt | mastracode`) instead of V1's
   `--prompt` + `; mastracode` REPL re-entry dance.

6. **Setup terminal becomes a launch.** Today there are *three*
   write paths into pane state — `buildSetupPaneLayout` writes
   `v2WorkspaceLocalState.paneLayout` directly, `dispatchForkLaunch`
   stashes on `pendingWorkspaces.terminalLaunch/chatLaunch`, and
   user edits go through the pane registry. PR 4 collapses paths 1
   and 2 into one `addLaunchPanes(workspaceId, launches)` call. The
   setup terminal gets a `{kind:"terminal", terminalId, label:"Setup"}`
   entry in `launches[]` and `buildSetupPaneLayout` joins PR 5's reap
   list.

Constraints carried over from `apps/desktop/plans/v2-create-decisions-final.md`:
- **No new pending-row phases.** Decision 7: a single `creating`
  status. PR 4 must not surface `building-launches` etc.
- **No `outcome` field in the response.** Decision 11. The shape
  stays `{ workspace, launches, terminals, warnings }`.

## Implementation order (vertical slices)

1. **Audit + plan update.** Read existing host terminal-start +
   `buildForkAgentLaunch`. Confirm what's reusable, what needs
   porting. ✅
2. **Extract `packages/launch-context`.** Pure file move; both
   renderer and host-service can now import the composer +
   buildLaunchSpec. ✅ (commit `7cbd388ac`)
3. **Migrate mastracode preset to stdin transport.** No schema
   change — PR 4's launch builder reads template defaults inline
   from `@superset/shared` constants, so `host_agent_configs` keeps
   its PR1 shape. Per-preset template customization deferred to a
   future flow. Mastracode `argv` + `--prompt` → `stdin` + no args.
   No `promptCommand` / suffix — argv-array spawn covers all
   builtins. ✅
4. **Terminal launch slice.** Build host-side `launches/` module
   (terminal-only): `build-agent-launch.ts` (calls launch-context
   with the host preset row), `start-terminal-launch.ts` (wraps
   `createTerminalSessionInternal`), `write-attachments.ts` (uses
   PR 2's attachment store). Wire into `create.ts`, update pending
   page to call `addLaunchPanes`. Manual-test a fork with an agent
   selected.
5. **Chat launch slice.** Add `start-chat-launch.ts`. Branch in
   `build-agent-launch` by preset transport. Manual-test chat
   preset. (Chat agent is the singleton `superset-chat`; no host
   table row.)
6. **Setup terminal as launch.** Push setup into `launches[]`, drop
   the `buildSetupPaneLayout` direct-write from the pending page.
7. **Open PR.**
