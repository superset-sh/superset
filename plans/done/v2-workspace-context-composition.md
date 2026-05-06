# V2 Workspace Launch Context — Composition

Closes Gaps 3, 4, 5 (unblocks 6) in `apps/desktop/V2_WORKSPACE_MODAL_GAPS.md`.
V2-only — V1 stays as-is. We rewrite where V1's shape is wrong; we duplicate
where V1 is fine.

## Problem

V2 launch must assemble context from many heterogeneous sources (user
prompt, linked issues, linked PR, linked tasks, attachments, agent
instructions, selected agent). Today `useSubmitWorkspace` sends a flat
string prompt + URLs. Doesn't scale to add Notion / Linear / repo docs
/ per-agent formatting / prompt caching.

## Vendor lessons

- **AI SDK v3** — `ModelMessage.content: ContentPart[]` (text | file |
  image). No string flatten. We adopt for V2 spec.
- **Anthropic API** — `system: Array<{type:'text', text, cache_control?}>`.
  Stable context lives in cacheable system blocks, not jammed into the
  user message every turn. We adopt the system/user split + ephemeral
  cache hint.
- **Continue.dev** — contributors carry `displayName`, `description`,
  `requiresQuery`. We adopt for free UI/validation.
- **Cursor** — agent declares supported context kinds. Defer to phase 2.
- **Mastra/Continue streaming** — partial context streaming. Defer.
- **Cline/V1 monolithic string** — explicitly reject.

## Architecture

```
Inputs → resolve sources → LaunchContext → buildLaunchSpec → executeAgentLaunch
```

### Types

```ts
type LaunchSource =
  | { kind: "user-prompt"; text: string }
  | { kind: "github-issue"; url: string }
  | { kind: "github-pr"; url: string }
  | { kind: "internal-task"; id: string }
  | { kind: "attachment"; file: ConvertedFile }
  | { kind: "agent-instructions"; path: string };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "file"; data: Uint8Array; mediaType: string; filename?: string }
  | { type: "image"; data: Uint8Array; mediaType: string };

interface ContextContributor<S extends LaunchSource> {
  kind: S["kind"];
  displayName: string;          // "GitHub Issue"
  description: string;
  requiresQuery: boolean;
  resolve(source: S, ctx: ResolveCtx): Promise<ContextSection | null>;
}

interface ContextSection {
  id: string;                   // "issue:123"
  kind: LaunchSource["kind"];
  scope: "system" | "user";
  label: string;
  content: ContentPart[];
  cacheControl?: "ephemeral";
  meta?: { taskSlug?: string; url?: string };
}

interface LaunchContext {
  projectId: string;
  sources: LaunchSource[];
  sections: ContextSection[];
  failures: Array<{ source: LaunchSource; error: string }>;
  taskSlug?: string;
  agent: { id: AgentDefinitionId | "none"; config?: ResolvedAgentConfig };
}

// V2-native — replaces V1's flat AgentLaunchRequest for the V2 path.
interface AgentLaunchSpec {
  agentId: AgentDefinitionId;
  system: ContentPart[];        // stable, cacheable
  user: ContentPart[];          // per-launch
  attachments: ContentPart[];   // file/image parts kept separate
  taskSlug?: string;
}
```

Default scopes: `agent-instructions` → system (cached). Everything else
→ user. Contributors may override per-source.

### Multi-source rules

- Array in, array out. Multi-of-kind + mixed-kind is the default.
- Input order preserved within a kind.
- Kind group order: `user-prompt → internal-task → github-issue → github-pr → attachment → agent-instructions`.
- Dedup by `source.id` pre-dispatch.
- `taskSlug`: first `internal-task` → first `github-issue` → undefined.
- File parts merge flat with collision-safe naming.
- Per-source failure → `failures[]` entry + null section + toast; launch proceeds.
- Multi-agent fan-out = run `buildLaunchSpec` N times.

### `ResolvedAgentConfig` extension

Add `contextPromptTemplate: { system: string; user: string }` (Mustache;
vars: `{{userPrompt}}`, `{{tasks}}`, `{{issues}}`, `{{prs}}`,
`{{attachments}}`, `{{agentInstructions}}`). Per-builtin defaults: Claude
ships XML-tagged sections; codex/cursor ship markdown headers. User
overrides via existing settings UI.

Rename `renderTaskPromptTemplate` → `renderPromptTemplate`. Add
`getSupportedContextPromptVariables()` next to the task variant.

### Pipeline

1. `buildLaunchContext(inputs)` — parallel resolve, dedup, order,
   `failures[]`, taskSlug derivation.
2. `buildLaunchSpec(ctx, agentConfig) → AgentLaunchSpec` — group by
   `scope`, render template into `system`/`user` content, preserve file/
   image parts in `attachments`, attach `cache_control` to system.
3. `executeAgentLaunch(spec, agentConfig)`:
   - **Chat**: structured passthrough (Anthropic system blocks + user
     `ContentPart[]`; AI-SDK shape).
   - **Terminal**: flatten `system + user` to text via existing
     `buildPromptCommandFromAgentConfig` + transport; write attachments
     to `.superset/attachments/` with refs in user content. Flatten is
     per-transport; spec stays structured.

### Attachment transport — bytes, not base64

V1 stores attachments as base64 data URLs end-to-end (IDB → Zustand →
tRPC-electron → `filesystem.writeFile({kind:"base64"})`). 33% size
overhead on every hop; 10MB PDF becomes a 13MB string in memory
repeatedly.

V2 ships `Uint8Array` natively:

- **Intake**: store `Blob` in IndexedDB (IDB supports Blobs first-class).
- **IPC**: pass `Uint8Array` over tRPC-electron with a JSON-safe
  transformer (SuperJSON handles typed arrays).
- **Disk write**: add `filesystem.writeFile({kind:"bytes", data: Uint8Array})`;
  terminal adapter's `writeAttachmentFiles` skips the base64 round-trip.
- **Chat provider boundary** (Anthropic/AI SDK HTTP): encode base64
  **once** right before the API call. Nowhere else in V2.
- **CLI / terminal agents**: never base64. Files land on disk via
  `writeAttachmentFiles`; prompt text references `.superset/attachments/
  <filename>`. CLIs read the filesystem — that's the right interface
  for them.
- **Phase 6 (chat only)**: Anthropic Files API — upload once, reference
  by file ID across chat launches. Smaller payloads, server-side cache.
  Does not apply to CLI agents.

`writeAttachmentFiles` collision-safe naming (sanitize → `attachment_N`
fallback → dedup `foo_1.png`) stays. Size/count limits stay.

### Extensibility

- New source = union variant + contributor file (with metadata) + registry entry.
- New consumer = one file reading `LaunchContext` or `AgentLaunchSpec`.
- New agent = entry in `ResolvedAgentConfig` (settings UI).
- New transport (e.g. native chat with file blocks) = one branch in `executeAgentLaunch`.

TypeScript errors at every integration point if a step is skipped.

## File layout

```
apps/desktop/src/shared/context/
  types.ts                  // LaunchSource, ContextSection, LaunchContext, AgentLaunchSpec, ContentPart
  composer.ts               // buildLaunchContext
  buildLaunchSpec.ts
  executeAgentLaunch.ts
  contributors/{userPrompt,githubIssue,githubPr,internalTask,attachment,agentInstructions}.ts
  consumers/{branchName,preview,createFromPr}.ts
apps/desktop/src/renderer/hooks/useEnqueueAgentLaunch/   // V2-owned, separate from V1 store
```

`shared/context/` has no React deps.

## V2 integration

- `useSubmitWorkspace.ts`: build `LaunchSource[]` from draft → `buildLaunchContext` → `buildLaunchSpec(ctx, agentConfig)`.
- After host-service `createWorkspace` resolves: `useEnqueueAgentLaunch(workspaceId, spec)`. V2-owned store; structured `AgentLaunchSpec`. Does **not** reuse V1's `useWorkspaceInitStore` — spec shape differs.
- Remote hosts (`hostTarget.kind === "remote"`) throw for now (no regression).
- Host-service `workspaceCreation.create` unchanged in phase 1.

V1 keeps its `AgentLaunchRequest` + `addPendingTerminalSetup` flow
untouched. Some duplication; intentional.

## Testing (TDD)

Pure functions throughout. Red → green each step.

- **Fixtures**: `__fixtures__/` with raw GH/task JSON + canonical `LaunchContext` + per-agent spec snapshots.
- **Contributors**: unit tests with stubbed `resolveCtx` (sanitize, truncate, null-on-404, scope assignment, slug derivation).
- **Composer**: dedup, order, taskSlug precedence, partial failure (`failures[]` populated), file merge, 10s per-contributor timeout.
- **`buildLaunchSpec`**: snapshot per agent (Claude XML, codex markdown, cursor markdown, raw); empty kinds skipped; file parts preserved (not flattened to text).
- **`executeAgentLaunch`**: chat passthrough preserves structure; terminal flatten produces correct command; attachments written to filesystem refs.

## Execution order (TDD)

1. `types.ts` (incl. `AgentLaunchSpec`, `ContentPart`) + fixtures.
2. Composer test → impl. Returns `{sections, failures, taskSlug}`.
3. Contributors with metadata, in order: `userPrompt`, `attachment`, `agentInstructions`, `githubIssue`, `githubPr`, `internalTask`.
4. `agent-prompt-template`: rename `renderTaskPromptTemplate` → `renderPromptTemplate`; add `getSupportedContextPromptVariables()`; add `DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM` + `_USER`; add Claude-XML default.
5. Extend `ResolvedAgentConfig` (terminal + chat) with `contextPromptTemplate: {system, user}`; thread through `resolveAgentConfig`, override fields, settings DB schema, per-builtin defaults.
6. `buildLaunchSpec(ctx, agentConfig)` — group by scope, render templates, preserve file/image parts. Snapshot per agent.
7. `executeAgentLaunch(spec, agentConfig)` — chat structured passthrough (base64 encode only at provider boundary); terminal flatten + `writeAttachmentFiles` via new `filesystem.writeFile({kind:"bytes"})` path. Add SuperJSON (or equivalent) transformer to tRPC-electron for `Uint8Array` IPC.
8. `useEnqueueAgentLaunch` hook (V2 store).
9. Wire into `useSubmitWorkspace`. Gaps 4, 5 closed.
10. `buildBranchNameContext` + wire AI branch name. Gap 3 closed.
11. `buildCreateFromPrInput` + wire PR-linked path. Gap 6 closed.

## Phases

1. Steps 1–9 above. Closes Gaps 4, 5 (local hosts).
2. Step 10. Closes Gap 3.
3. Step 11. Closes Gap 6.
4. Task popover migration (`RunInWorkspacePopover`, `OpenInWorkspace`) → `{kind: "internal-task", id}` sources.
5. Remote-host launch over tRPC (host-service-side `executeAgentLaunch`).
6. Anthropic Files API for **chat** attachments — upload once, reference by ID. CLI agents unaffected (stay on filesystem + path-ref pattern).
7. Phase-2 vendor adoptions if needed: streaming partial context, agent-declared supported kinds, token budgeting.

## Risks

- **Over-abstraction** — phase 1 ships V2 end-to-end; abstraction flexes immediately at step 9. Re-evaluate if friction.
- **Prompt shape drift** — snapshot tests per agent.
- **Slow fetch stalls submit** — 10s per-contributor timeout; partial failures non-fatal.
- **V2/V1 duplication of pending-setup store** — intentional; consolidating risks regressing V1.
- **Remote hosts** — explicit throw until phase 5.
- **IPC transformer regression risk** — adding SuperJSON affects all existing tRPC-electron calls. Gate behind tests, roll out carefully.

## Open questions

1. Live-reactive preview vs. pure on-submit? Pure first.
2. Agent picker in V2 modal? Add a default-agent display pill at minimum.
3. Token budget / pruning — no vendor implements at composition layer (Anthropic enforces 200k API-side). Defer.
4. Streaming partial context (Mastra/Continue) — defer to phase 6.
5. Cross-process composer (CLI / host-service-side) — promote to shared package when needed.

## Non-goals

LLM framework. Server-side prompt assembly (phase 1). Streaming
composition. V1 changes. Token budgeting in composition layer.
