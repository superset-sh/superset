# V2 Workspace Modal — Host-Service AI Branch Naming

Port v1's AI branch-name generation into v2's workspace modal, routed through host-service. Approach: **use upstream `mastracode`'s `resolveModel`** via a lightweight `createMastraCode({ disableMcp: true, disableHooks: true })` singleton. Delete our small-model abstraction; keep OAuth parity (Claude Max + Codex) because mastracode handles it internally.

## Completed

- ✅ Bumped `mastracode` 0.9.2 → **0.14.0** (+ transitive `@mastra/core` 1.16 → 1.25). Typecheck + tests green. Removed `minimumReleaseAge` from `bunfig.toml`.

## Target architecture

```
v2 useSubmitWorkspace
  └─> client.workspaceCreation.generateBranchName.mutate({ projectId, prompt })
        └─> generateBranchNameFromPrompt(...)                       [host-service]
              └─> getSmallModel()                                    [shared helper]
                    └─> resolveModel(modelId)                        from mastracode
                          (full auth: API-key + keychain + OAuth middleware)
```

Desktop v1's existing `ai-branch-name.ts` migrates to the same `getSmallModel` helper — single implementation, two consumers.

## Shared helper

`packages/chat/src/server/shared/small-model/get-small-model.ts`:

```ts
import { createAuthStorage, createMastraCode } from "mastracode";
import type { MastraLanguageModel } from "@mastra/core/llm";

const ANTHROPIC_SMALL = "anthropic/claude-haiku-4-5-20251001";
const OPENAI_SMALL = "openai/gpt-4o-mini";

type Resolver = Awaited<ReturnType<typeof createMastraCode>>["resolveModel"];
let initPromise: Promise<Resolver> | null = null;

function getResolver(): Promise<Resolver> {
  if (!initPromise) {
    initPromise = createMastraCode({ disableMcp: true, disableHooks: true })
      .then((r) => r.resolveModel);
  }
  return initPromise;
}

function pickSmallModelId(): string | null {
  const auth = createAuthStorage();
  auth.reload();
  if (auth.has("anthropic")) return ANTHROPIC_SMALL;
  if (auth.has("openai")) return OPENAI_SMALL;
  return null;
}

export async function getSmallModel(): Promise<MastraLanguageModel | null> {
  const modelId = pickSmallModelId();
  if (!modelId) return null;
  const resolveModel = await getResolver();
  return resolveModel(modelId) as MastraLanguageModel;
}
```

Module-level promise caches the mastracode init (one-time cost per process). Credential check is per-call (cheap, in-memory).

## Code-removal budget

| File | LOC | Fate |
|---|---|---|
| `apps/desktop/src/lib/ai/call-small-model.ts` | 184 | delete |
| `apps/desktop/src/lib/ai/call-small-model.test.ts` | 399 | delete |
| `apps/desktop/src/lib/ai/provider-diagnostics.ts` | 89 | delete if no other consumer |
| `packages/chat/src/server/desktop/small-model/small-model.ts` | 146 | delete |
| `packages/chat/src/server/desktop/small-model/small-model.test.ts` | 391 | delete |
| `packages/chat/src/server/desktop/title-generation/title-generation.ts` | 99 | trim (~50, drop streaming variant) |
| `packages/chat/src/server/desktop/auth/anthropic/anthropic.ts` | 232 | trim (~50, keep OAuth login helpers chat-service uses) |
| `packages/chat/src/server/desktop/auth/openai/openai.ts` | 99 | trim (~30) |
| `apps/desktop/src/lib/trpc/routers/workspaces/utils/ai-branch-name.ts` | 117 | rewrite → ~60 |
| New `shared/small-model/get-small-model.ts` | — | +50 |

Net: **~1200 lines removed**.

---

## Step 1 — Shared helper + migrate v1 branch naming

### Actionable tasks
1. Create `packages/chat/src/server/shared/small-model/{get-small-model.ts, index.ts}` with the helper above.
2. Update `packages/chat/src/server/desktop/index.ts` barrel if needed; new helper lives in `shared/` and is imported directly from `@superset/chat/server/shared/small-model` — no re-export from desktop.
3. Rewrite `apps/desktop/src/lib/trpc/routers/workspaces/utils/ai-branch-name.ts`:
   - Replace `callSmallModel` + provider branching with `getSmallModel()` + `generateText({ model, system, prompt })`.
   - Keep `BRANCH_NAME_INSTRUCTIONS`, `resolveConflict`, `sanitizeBranchNameWithMaxLength`.
4. Grep for `callSmallModel`, `SmallModelProvider`, `getDefaultSmallModelProviders`, `generateTitleFromMessageWithStreamingModel`:
   - Rewrite each consumer to `getSmallModel` + `generateText` (or Mastra Agent if the caller wants tracing).
5. Delete:
   - `apps/desktop/src/lib/ai/call-small-model.ts` + test.
   - `packages/chat/src/server/desktop/small-model/small-model.ts` + test + `index.ts`.
   - `generateTitleFromMessageWithStreamingModel` from `title-generation.ts`.
6. `apps/desktop/src/lib/ai/provider-diagnostics.ts` — grep for consumers; delete if only `call-small-model.ts` uses it. Otherwise leave.
7. Audit `auth/anthropic` and `auth/openai`: keep exports chat-service uses for OAuth login UI; delete any credential-resolution helpers used only for small-model.
8. Run `bun run typecheck` + focused tests (chat-service, ai-branch-name). Fix breaks.
9. Smoke: launch desktop, create v1 workspace with a prompt, verify AI branch naming still works (both API key and OAuth paths).

### Risks (step 1)
- **mastracode init side effects**: `createMastraCode` with disabled MCP/hooks still initializes storage, auto-detects project, etc. Confirm startup stays under ~200ms and doesn't create unwanted files. If it tries to touch a DB/libsql, pass an explicit `storage` config.
- **Second init conflict**: chat service already calls `createMastraCode` for its runtime. Running a second one for small-model might duplicate auth-storage singletons or compete for files. Mitigation: verify `createMastraCode` is side-effect-safe when called twice; if not, share the existing chat runtime's resolver.
- **Credential regression**: `authStorage.has("anthropic")` must cover all the "credential present" cases our current `getAnthropicCredentialsFromAnySource` covers (env vars, stored API keys, OAuth). Audit before replacing.

---

## Step 2 — Host-service procedure

### Actionable tasks
1. Port `sanitizeBranchNameWithMaxLength` (`apps/desktop/src/shared/utils/branch.ts`) and `resolveBranchPrefix` (`apps/desktop/src/lib/trpc/routers/workspaces/utils/branch-prefix.ts`) into `packages/host-service/src/trpc/router/workspace-creation/utils/`.
2. Create `packages/host-service/src/trpc/router/workspace-creation/utils/ai-branch-name.ts` — same helper as desktop's rewritten v1, imports `getSmallModel` from `@superset/chat/server/shared/small-model`.
3. Add to `workspace-creation.ts`:
   ```ts
   generateBranchName: publicProcedure
     .input(z.object({ projectId: z.string(), prompt: z.string() }))
     .mutation(async ({ input }) => {
       const trimmed = input.prompt.trim();
       if (!trimmed) return { branchName: null };
       const project = /* existing project lookup */;
       const existingBranches = /* existing branch listing */;
       const prefix = await resolveBranchPrefix(project, existingBranches);
       const branchName = await generateBranchNameFromPrompt(trimmed, existingBranches, prefix);
       return { branchName };
     }),
   ```
4. Delete `packages/host-service/src/providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts` + `resolveOpenAICredential.ts` if unused after step (LocalModelProvider no longer needs them since auth flows through mastracode).
5. Run typecheck + host-service tests.

---

## Step 3 — Wire v2

### Actionable tasks
1. Update `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts`:
   - Compute `willGenerateAIName = !draft.branchNameEdited && !!trimmedPrompt && !draft.linkedPR`.
   - Fallback via `resolveNames(draft)` (unchanged).
   - Insert pending row with status `"generating-branch"` if `willGenerateAIName`.
   - Close + navigate (unchanged).
   - If `willGenerateAIName`, race `client.workspaceCreation.generateBranchName.mutate(...)` vs 30s timeout:
     - success → update pending row `branchName` + status `"creating"`.
     - auth error → toast + abort + remove pending row.
     - other/timeout → toast `"Using random branch name..."`, keep fallback name.
   - Call `client.workspaceCreation.create(...)` with resolved `branchName`.
2. Add `"generating-branch"` to `pendingWorkspaces` status union (`packages/local-db/src/schema/schema.ts`). Drizzle migration.
3. Update pending page UI (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx`) to render "Naming your branch…" for that status.

---

## Effort

| Step | Effort |
|---|---|
| 0. mastracode upgrade | ✅ done |
| 1. Shared helper + v1 migration + deletions | 2–3 hrs |
| 2. Host-service procedure | 1–1.5 hrs |
| 3. v2 wiring + pending UI | 1–2 hrs |
| **Remaining** | **~4–6.5 hrs** |

## Risks

- **mastracode init side effects** at singleton init (see step 1).
- **Remote host-service API-key availability**: remote hosts need `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` set; otherwise v2 on remote hosts falls back to random-name. Document.
- **OAuth parity in host-service**: host-service can't do an interactive OAuth flow. `createAuthStorage().loadStoredApiKeysIntoEnv(...)` loads stored API keys but NOT OAuth tokens into env. For host-service, OAuth-only users get random names.
- **Diagnostics UI**: removing `provider-diagnostics.ts` removes mid-call `reportProviderIssue` signals. Audit settings UI for providers; they may source signals from chat-service regardless.

## Out of scope
- Live/debounced ghost suggestion in v2 branch-name input.
- Retiring v1's desktop-tRPC `generateBranchName` procedure (it becomes a proxy over the shared helper; deleting it is a follow-up).
