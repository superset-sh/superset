# MiniMax Chat Provider — Complete Implementation SPEC

> Status: **Phase 0-2 complete, Phase 4 in progress, Phase 3/5-9 not started.**
> Branch: `feat/minimax-chat-provider` on `p1rat3/superset`
> Local: `/home/racie/projects/superset`
> Started: 2026-06-10
> Estimated remaining work: 1-1.5 focused dev days (verified by tests)

---

## 1. State of work

### 1.1 Commits made so far

```
c7df5b3ab  chore: bootstrap fork and trace chat architecture
11bce26    feat(chat): add MiniMax auth resolver
            (M3 still NOT in registry, will be next commit if you say go)
```

Branch state: `feat/minimax-chat-provider` (local only — **not pushed yet**).

### 1.2 Files created

| Path | Purpose | Status |
|---|---|---|
| `ARCHITECTURE.md` | Chat architecture trace (pre-implementation) | committed |
| `MINIMAX_TODO.md` | 9-phase implementation plan | committed |
| `packages/chat/src/server/desktop/auth/minimax/minimax.ts` | Auth resolver | committed |
| `packages/chat/src/server/desktop/auth/minimax/minimax.test.ts` | 8 unit tests | committed |
| `packages/chat/src/server/desktop/auth/minimax/index.ts` | Re-exports | committed |
| `MINIMAX_SPEC.md` | **this file** | new |

### 1.3 Files modified

| Path | Change |
|---|---|
| `packages/chat/src/server/shared/auth-provider-ids.ts` | Added `MINIMAX_AUTH_PROVIDER_ID = "minimax"` export |

### 1.4 Code that exists (verbatim)

`auth-provider-ids.ts` (the new lines):
```ts
// MiniMax (minimax.io) — Anthropic-protocol provider. Single key, no OAuth.
// See packages/chat/src/server/desktop/auth/minimax/ for the resolver.
export const MINIMAX_AUTH_PROVIDER_ID = "minimax";
```

`minimax.ts` (key snippet — read full file from the path):
```ts
import { createAuthStorage } from "mastracode";
import { MINIMAX_AUTH_PROVIDER_ID } from "../provider-ids";

export interface MiniMaxCredentials {
  apiKey: string;
  providerId: typeof MINIMAX_AUTH_PROVIDER_ID;
  source: "auth-storage";
  kind: "apiKey";
}

export function getMiniMaxCredentialsFromAuthStorage(
  authStorage = createAuthStorage(),
): MiniMaxCredentials | null {
  try {
    authStorage.reload();
    const credential = authStorage.get(MINIMAX_AUTH_PROVIDER_ID);
    if (!isObjectRecord(credential)) return null;
    if (
      credential.type === "api_key" &&
      typeof credential.key === "string" &&
      credential.key.trim().length > 0
    ) {
      return {
        apiKey: credential.key.trim(),
        providerId: MINIMAX_AUTH_PROVIDER_ID,
        source: "auth-storage",
        kind: "apiKey",
      };
    }
  } catch (error) {
    console.warn("[minimax/auth] Failed to read auth storage:", error);
  }
  return null;
}

export function getMiniMaxCredentialsFromAnySource(): MiniMaxCredentials | null {
  return getMiniMaxCredentialsFromAuthStorage();
}
```

### 1.5 What is NOT done yet

- [ ] Phase 3: Wire MiniMax into `chat-service.ts`
- [ ] Phase 4: Add `MiniMax-M3` to the model registry
- [ ] Phase 5: Settings UI (MiniMax section in settings page)
- [ ] Phase 6: Model picker (make sure M3 surfaces)
- [ ] Phase 7: Integration tests (auth tests done, need chat-service tests)
- [ ] Phase 8: Docs
- [ ] Phase 9: Build verification on WSL/desktop

---

## 2. Persistence map — where state lives

| What | Where | Format | Notes |
|---|---|---|---|
| Anthropic API key | mastracode auth-storage | JSON | key: `"anthropic"`, value: `{type:"api_key", key:"sk-ant-..."}` |
| Anthropic base URL override | same | JSON | key: `"anthropic"`, value: `{type:"api_key", key, baseUrl}` |
| OpenAI API key / OAuth | same | JSON | key: `"openai-codex"` or `"openai"` |
| **MiniMax API key (new)** | same | JSON | key: `"minimax"`, value: `{type:"api_key", key:"sk-cp-..."}` |
| **MiniMax base URL override (new)** | same | JSON | same entry, `baseUrl` field |
| Superset workspaces / settings | `~/.superset/local.db` | SQLite (drizzle ORM) | Has `workspaces`, `settings`, `users`, `projects` tables |
| Provider config (M2/M3/GPT-5 etc) | `~/.superset/tanstack-db.sqlite` | SQLite | Tanstack DB collection tables (25+) |
| Active chat session | `~/.superset/local.db` | SQLite | `chat_sessions` table |
| Chat messages (history) | `~/.superset/tanstack-db.sqlite` | SQLite | Streamed in, persisted after stream completes |
| OAuth tokens (refresh, etc) | mastracode auth-storage | JSON | alongside api_key entries |

**Key insight for implementation:** the auth-storage is one JSON file keyed by
provider id. To add MiniMax we just need a new key. No schema migration, no DB
migration, no Superset restart for setting changes — the chat-service reads
from auth-storage on every request.

To find the auth-storage file location, run on a machine with Superset:
```bash
find ~ -path "*/mastracode/*" -name "*.json" 2>/dev/null | head -5
```

---

## 3. Architecture (one-paragraph + reference)

The chat panel in Superset desktop renders in an Electron renderer process
(`apps/desktop/src/renderer/`, compiled to `renderer/assets/page-*.js`). It calls
a TRPC server (`packages/chat/src/server/trpc/`) running in the host-service
(apps/desktop). The TRPC server dispatches to `chat-service.ts` which:
1. Resolves credentials via `packages/chat/src/server/desktop/auth/{anthropic,openai,minimax}/`.
2. Picks a transport (Anthropic SDK, OpenAI SDK, or future MiniMax transport).
3. Streams a message via the AI SDK to the upstream API.

Provider selection today is hardcoded: if `isAnthropicAuthenticated` → Anthropic,
else if `isOpenAIAuthenticated` → OpenAI. The model registry (`provider_registry_default`)
is a hardcoded TS object listing which models each provider supports. The current
Superset 1.12.5 build has `minimax-coding-plan` registered with M2.x models but
**no M3**.

Full architecture detail in `ARCHITECTURE.md` (committed).

---

## 4. Roadmap — what needs to be done

Each phase = 1 commit. Order top to bottom. Phases 3-9 are NOT done.

### Phase 3: Chat-service wiring

**Goal:** when the user picks a MiniMax model, route the request through MiniMax
auth + MiniMax transport.

**Files to modify:**
- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
  - Import the new MiniMax auth module
  - Add `getMiniMaxCredentialsFromAnySource()` call alongside the Anthropic/OpenAI ones
  - Add a new branch in the provider-selection logic for `model.startsWith("minimax/")` or model id in a known set
  - Add `logAuthResolution("minimax", ...)` calls
  - Expose MiniMax status via the existing TRPC auth procedures (or add new ones)

**Files to add:**
- (none expected — extend the existing chat-service.ts)

**Acceptance:** reading the source shows MiniMax auth resolution runs in parallel
with Anthropic/OpenAI; provider selection prefers MiniMax when the picked model
id matches.

**Risk:** HIGH — chat-service.ts is the routing hub. A bug here breaks chat for
everyone. Must have working tests before merging.

### Phase 4: Model registry — `MiniMax-M3`

**Goal:** add `MiniMax-M3` to the `minimax-coding-plan` provider entry in the
hardcoded model list, so the picker shows it.

**What to find:** the source for `provider_registry_default`. This is the same
list I saw at line 69310 of the compiled `app.asar` bundle. The source is
somewhere in `packages/chat/src/server/...` — most likely a TS file or a JSON
file. Search:

```bash
cd /home/racie/projects/superset
grep -rEn "minimax-coding-plan" --include="*.ts" --include="*.json" -l . \
  | grep -v node_modules | grep -v ".git/"
```

Should be 1-3 files. Open them, find the entry that has `models: ["MiniMax-M2", ...]`,
add `"MiniMax-M3"` to that array.

**Acceptance:** `grep -r "MiniMax-M3" packages/chat/src/` returns the registry
file. When the desktop app is rebuilt, M3 appears in the picker.

**Risk:** LOW — it's adding a string to an array. Worst case: a typo means M3
doesn't appear in the picker (recoverable).

### Phase 5: Settings UI

**Goal:** add a "MiniMax" section to the chat settings page (Settings →
Provider Accounts → MiniMax) with: API key field, Advanced section with
baseUrl, same UX as the existing Anthropic section.

**What to find:** the source for the compiled `renderer/assets/page-9llLG1MH.js`
which is the chat settings page. This source is in `apps/desktop/src/renderer/`
somewhere. Search:

```bash
cd /home/racie/projects/superset
grep -rEn "Anthropic Model Auth|OpenAI Model Auth|getAnthropicStatus" \
  --include="*.ts" --include="*.tsx" -l apps/desktop/ \
  | grep -v node_modules
```

That'll point at the settings page source. Add a parallel MiniMax section.

**Files to add:**
- A new `MiniMaxAuthSection` component (or whatever naming pattern the existing
  sections use — `AnthropicAuthSection`, `OpenAIAuthSection` if they exist)
- Mirror the Anthropic section's structure: API key field, Advanced collapsible,
  baseUrl input, "Connect MiniMax in Settings" tooltip when unauth'd, badge
  showing status

**Files to modify:**
- The settings page entry component to render the new section
- The TRPC procedure definitions to add `setMiniMaxApiKey`, `getMiniMaxStatus`,
  `clearMiniMaxApiKey` (or extend the existing procedures to handle multiple
  provider ids generically — preferred)

**Acceptance:** Settings → Chat Providers shows a "MiniMax" card. Clicking it
opens a section with the API key field. Saving writes to auth-storage under
key `"minimax"`.

**Risk:** MEDIUM — UI changes are well-bounded but the TRPC procedure signature
changes ripple into the chat-service.ts.

### Phase 6: Model picker

**Goal:** make sure MiniMax-M3 shows up in the model picker dropdown at the
bottom of the chat input, and add a "MiniMax" group header (like Anthropic
and OpenAI already have).

**What to find:** the source for the compiled `renderer/assets/dev-chat-*.js`
(which is the dev-mode fallback model list — this DOES exist in source as
`apps/desktop/src/renderer/...`) and the production picker code (which fetches
the list from a TRPC endpoint at runtime).

```bash
cd /home/racie/projects/superset
grep -rEn "claude-opus-4-7|DEV_CHAT_MODELS" --include="*.ts" --include="*.tsx" -l apps/desktop/ \
  | grep -v node_modules
```

**Files to modify:**
- The dev-mode fallback model list to add MiniMax-M3 (so it's there even if
  the production picker hasn't been updated)
- The picker rendering code to add a "MiniMax" provider group

**Acceptance:** clicking the model picker at the bottom of the chat input shows
"OpenAI", "Anthropic", and "MiniMax" as group headers. Under "MiniMax" is
`MiniMax-M3` and other M-series models.

**Risk:** MEDIUM — picker logic is shared with the auth check, easy to introduce
a render bug.

### Phase 7: Tests

**Already done:** 8 unit tests in `minimax.test.ts` for the auth resolver.

**To add:**

- `packages/chat/src/server/desktop/chat-service/chat-service.test.ts`
  - Mock auth-storage, verify MiniMax credentials get used when present
  - Verify provider selection logic when MiniMax is authenticated
- `packages/chat/src/server/desktop/auth/minimax/minimax.test.ts`
  - **already done** ✓
- Test the settings UI validation (form rejects empty key, accepts non-empty)
- Test model registry contains MiniMax-M3 (just `expect(REGISTRY).toContain("MiniMax-M3")`)

**Acceptance:** `bun test packages/chat` passes. Coverage report shows
the new code paths are tested.

### Phase 8: Docs

**Files to add:**
- `docs/providers/minimax.md` (if `docs/providers/` doesn't exist, create it)
  - One-pager: what is MiniMax, how to get an API key, how to configure in
    Superset, what models are available, link to https://api.minimax.io
- Update main docs index if there's a providers list

**Files to modify:**
- `README.md` if it lists supported providers
- `apps/desktop/README.md` if it has one

**Acceptance:** a user reading the docs can configure MiniMax in Superset
without needing to read code.

### Phase 9: Verify

**What to do:**
1. `cd /home/racie/projects/superset && bun install && bun test packages/chat`
2. If desktop dev works on your env: `bun run dev:desktop`, then GUI-test
3. If desktop dev doesn't work on WSL: `bun run build --filter=@superset/desktop`
   to produce a production bundle, run the built bundle, GUI-test
4. Verify chat works: pick MiniMax-M3, send "Reply with PONG", expect PONG
5. Verify Anthropic still works (regression check)
6. Verify OpenAI still works (regression check)

**Acceptance:** all 3 providers (Anthropic, OpenAI, MiniMax) work end-to-end.
Build succeeds. All tests pass.

---

## 5. Branch & git workflow

### 5.1 Current state

```
Branch: feat/minimax-chat-provider (local only)
Remote: github.com/p1rat3/superset
Upstream: github.com/superset-sh/superset
HEAD: 11bce26 (Phase 1+2 done)
```

### 5.2 Push command (preserves work)

```bash
cd /home/racie/projects/superset
git push -u origin feat/minimax-chat-provider
```

This pushes the 2 commits to github.com/p1rat3/superset. The branch is
preserved even if the WSL disk dies.

### 5.3 Recommended commit sequence (Phases 3-9)

```bash
git checkout feat/minimax-chat-provider

# Phase 3
git add packages/chat/src/server/desktop/chat-service/chat-service.ts
git commit -m "feat(chat): route MiniMax requests through the chat service"

# Phase 4
git add <registry-source-file>
git commit -m "feat(chat): add MiniMax-M3 to model registry"

# Phase 5
git add apps/desktop/src/renderer/...
git commit -m "feat(chat-settings): add MiniMax provider section"

# Phase 6
git add apps/desktop/src/renderer/...
git commit -m "feat(chat): add MiniMax to model picker"

# Phase 7
git add packages/chat/src/server/.../*.test.ts
git commit -m "test(chat): cover MiniMax provider selection and adapter"

# Phase 8
git add docs/providers/minimax.md
git commit -m "docs(chat): add MiniMax setup instructions"

# Final push
git push origin feat/minimax-chat-provider
```

---

## 6. Handoff to a coding agent

### 6.1 If you want me to keep going (from this session)

I can keep going from where I left off. Just say "continue" and I'll do
Phase 4 next (low risk, just adding a string to an array).

### 6.2 If you want to hand off to Claude Code

```bash
cd /home/racie/projects/superset
claude "Continue the MiniMax chat provider implementation. Read MINIMAX_TODO.md
and MINIMAX_SPEC.md for context. Phase 1+2 are done. Start with Phase 4
(add MiniMax-M3 to the model registry — search for 'minimax-coding-plan'
in the source to find the right file). Then do Phases 3, 5, 6, 7, 8 in
order. Run 'bun test packages/chat' after each phase to verify. Don't
merge until all phases pass."
```

### 6.3 If you want to hand off to Codex

Codex is more terse, better at code-gen than reading spec docs. Give it
one phase at a time:

```bash
cd /home/racie/projects/superset
codex --profile minimax-m3 exec "Read packages/chat/src/server/desktop/chat-service/chat-service.ts.
Add MiniMax auth resolution alongside the existing Anthropic and OpenAI
resolutions. The new module is at packages/chat/src/server/desktop/auth/minimax/.
Import getMiniMaxCredentialsFromAnySource. Add a logAuthResolution('minimax', ...)
call. Wire it into the existing provider-selection logic. Run 'bun test
packages/chat' after to verify nothing broke."
```

---

## 7. MiniMax API contract (for the adapter implementer)

The MiniMax API base URL is `https://api.minimax.io`. Two protocols are exposed:

- **Anthropic protocol:** `https://api.minimax.io/anthropic/v1`
  - Endpoints: `/v1/messages`, etc.
  - Auth: `x-api-key: <MINIMAX_API_KEY>` header (NOT `Authorization: Bearer`)
  - Required header: `anthropic-version: 2023-06-01`
  - Models: `MiniMax-M3`, `MiniMax-M2.5`, `MiniMax-M2.7`, etc.
  - Request/response format is **Anthropic Messages API** format
  - **This is the path the Superset integration uses** because Superset's
    chat already speaks Anthropic protocol

- **OpenAI protocol:** `https://api.minimax.io/v1`
  - Endpoints: `/v1/chat/completions`, etc.
  - Auth: `Authorization: Bearer <MINIMAX_API_KEY>`
  - Models: `MiniMax-M3`, etc.
  - Request/response format is **OpenAI Chat Completions** format
  - This is what Codex/CLI agents use

The fork should route through the Anthropic path because that's the SDK already
loaded by Superset's chat-service.

**Environment variables used today (kept for reference):**
- `MINIMAX_API_KEY` — full key, in `~/.hermes/.MiniMax-env` (chmod 600)
- `MINIMAX_API_HOST` — `https://api.minimax.io`
- `MINIMAX_API_BASE_URL` — optional override (defaults to `${MINIMAX_API_HOST}/v1`)

---

## 8. Quick reference — commands

```bash
# Push current work to your fork
cd /home/racie/projects/superset
git push -u origin feat/minimax-chat-provider

# Run the chat package tests (after bun install works)
bun test packages/chat

# Run typecheck
bun run typecheck --filter=@superset/chat

# Find the model registry source
grep -rEn "minimax-coding-plan" --include="*.ts" --include="*.json" -l . \
  | grep -v node_modules

# Find the settings UI source
grep -rEn "Anthropic Model Auth|getAnthropicStatus" --include="*.ts" --include="*.tsx" -l apps/desktop/

# Verify auth-storage state (read-only inspection)
find ~ -path "*/mastracode/*" -name "*.json" 2>/dev/null | head -5

# Pull latest from upstream (optional)
git fetch upstream
git rebase upstream/main  # resolve any conflicts in your branch
```

---

## 9. Known gotchas

1. **bun install broken in this WSL env.** I can't run tests here. You'll need
   a working env to run `bun test packages/chat`. The auth code I wrote is
   unverified — treat it as untested until you confirm.

2. **The Superset desktop dev server officially supports macOS only.** Getting
   it to run on WSL2/Linux is non-trivial. The Phase 9 verification may need
   to be done by building a production bundle and running that, or by testing
   on a macOS machine.

3. **The model registry source is hidden.** The compiled bundle has it
   hardcoded as `provider_registry_default` but the source file isn't
   obvious. The grep in §4 Phase 4 should find it. If it doesn't, look in
   `packages/chat/src/server/...` for files mentioning `gateway` or
   `models.dev`.

4. **Renderer source vs compiled bundle.** The settings UI is in
   `apps/desktop/src/renderer/...` (TSX) but the runtime is in
   `renderer/assets/page-9llLG1MH.js` (compiled). When you change the source,
   you must rebuild the renderer bundle for changes to take effect.

5. **Auth-storage is shared with mastracode.** If a different process writes
   to the same file (e.g. CLI agents running in a workspace), the chat-service
   needs to `reload()` before reading. The existing code does this.

---

## 10. Definition of done (per the original spec)

- [ ] MiniMax appears as a selectable provider in Chat UI
- [ ] Can configure it from the UI without reusing Anthropic labels
- [ ] A real chat request succeeds using MiniMax after configuration
- [ ] Existing Anthropic + OpenAI providers still work
- [ ] The project builds and runs locally
- [ ] Docs are updated

Current state: 0/6 of the above are met. The foundation (auth resolver,
provider id) is in place but unverified by tests.
