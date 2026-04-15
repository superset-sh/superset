# V2 Workspace Launch Context

Status as of PR #3467 (branch `v2-modal-agent-launch`). See
`plans/v2-workspace-context-composition.md` for the full design.

## What shipped (phase 1)

V2 "fork" workspaces now launch an agent with the user's prompt, linked
issue/PR/task metadata, and attached files. Gaps 4 and 5 from
`V2_WORKSPACE_MODAL_GAPS.md` are closed; Gaps 3 and 6 remain open.

### Pipeline

```
draft (modal)
  → PendingWorkspaceRow
    → buildForkAgentLaunch (pending page)
      ├─ buildLaunchSourcesFromPending      → LaunchSource[]
      ├─ buildLaunchContext                 → LaunchContext
      ├─ buildLaunchSpec                    → AgentLaunchSpec
      └─ buildAgentLaunchRequest            → AgentLaunchRequest (V1 shape)
  → host-service.workspaceCreation.create   (workspace exists)
  → useEnqueueAgentLaunch                   (pending setup stashed)
  → V1 terminal-adapter / chat-adapter      (picks up on workspace mount)
  → Agent runs in the worktree
```

### Files

- `shared/context/types.ts` — `LaunchSource`, `ContentPart`, `ContextSection`, `LaunchContext`, `AgentLaunchSpec`.
- `shared/context/composer.ts` — `buildLaunchContext` (parallel resolve, dedup, failure-tolerant).
- `shared/context/contributors/*` — one per source kind: `userPrompt`, `githubIssue`, `githubPr`, `internalTask`, `attachment`.
- `shared/context/buildLaunchSpec.ts` — agent-aware template rendering, inline-multimodal preservation.
- `shared/context/buildAgentLaunchRequest.ts` — V2 spec → V1 request bridge (base64 encoding, collision-safe filenames).
- `renderer/hooks/useEnqueueAgentLaunch/*` — wrap V1's `useWorkspaceInitStore.addPendingTerminalSetup`.
- `routes/.../pending/$pendingId/buildForkAgentLaunch.ts` — pure helper that runs the pipeline for the pending page.
- `routes/.../pending/$pendingId/page.tsx` — wires the enqueue after `createWorkspace` resolves.

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

## Follow-ups (roughly in priority order)

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
