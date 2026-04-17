# Manual Testing Plan — PR #3517

## Prerequisites
- Desktop dev running (`bun dev` from apps/desktop, or full `bun dev` from root)
- At least one project configured with a git repo

## 1. v1 AI Branch Naming (API key path)

**Setup**: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set in env (or stored via Settings > Models).

| Step | Expected |
|---|---|
| Open v1 new-workspace modal (Cmd+N) | Modal opens |
| Type a prompt: "fix dropdown alignment bug" | Text entered |
| Submit (Enter or click Create) | Modal closes, pending workspace shows "Generating branch…" briefly |
| Wait for workspace to initialize | Branch name is AI-generated kebab-case (e.g. `fix-dropdown-alignment`), not random words |
| Check worktree | Branch exists locally |

## 2. v1 AI Branch Naming (no credentials)

**Setup**: unset `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from env. No stored API keys in Settings > Models.

| Step | Expected |
|---|---|
| Create workspace with prompt | Branch name falls back to random friendly name (e.g. `pickle-streetcar`) or prompt-derived slug |
| No error toast | Degradation is silent |

## 3. v1 Workspace Auto-Rename

**Setup**: API key available.

| Step | Expected |
|---|---|
| Create workspace with prompt "refactor auth middleware" | Workspace title updates to AI-generated name (e.g. "Refactor Auth Middleware") after a few seconds |
| If no API key available | Title falls back to prompt text or friendly name |

## 4. Anthropic OAuth Auto-Refresh (from #3510)

**Setup**: Anthropic OAuth configured (Claude Max). Requires waiting for token expiry or manual simulation.

| Step | Expected |
|---|---|
| Sign in to Anthropic via OAuth in Settings > Models | "Active" badge appears |
| Force-expire: edit `~/Library/Application Support/mastracode/auth.json`, set `anthropic.expires` to a past timestamp | — |
| Send a chat message | Chat succeeds silently (token auto-refreshed via `authStorage.getApiKey`). No "Reconnect" banner. |
| If refresh token is also invalid | Falls to expired state, "Reconnect" button appears (expected) |
| Check terminal for `[chat-service] Anthropic OAuth refresh failed` | Logged if refresh fails (new in this PR) |

## 5. Settings > Models Page

| Step | Expected |
|---|---|
| Navigate to Settings > Models | Page loads, shows Anthropic + OpenAI sections |
| Anthropic shows connection status based on auth-status (not diagnostics) | "Active" / "No account connected" / "Expired" as appropriate |
| Click Connect (Anthropic) → complete OAuth | Status updates to "Active" |
| Click Logout → confirm | Status updates to "No account connected" |
| Set API key → Save | "Anthropic API key updated" toast |
| Clear API key → confirm | "Anthropic API key cleared" toast |
| Same for OpenAI | Same behavior |
| **No "Needs attention" banner from provider-diagnostics** | Diagnostics removed — status derived from auth only |

## 6. Production Build

| Step | Expected |
|---|---|
| `bun run compile:app` (from apps/desktop) | Succeeds. `get-small-model` chunk ~1.2 MB, no 20 MB chunk. |
| `bun run copy:native-modules` | Succeeds |
| `bun run validate:native-runtime` | All checks pass |
| `npx electron dist/main/index.js` | Main process boots (renderer 404 expected in non-packaged mode). No onnxruntime error. |

## 7. Host-Service Procedure (dormant — future v2)

Not yet wired to UI. Verify via tRPC playground or direct call if available:

| Step | Expected |
|---|---|
| Call `workspaceCreation.generateBranchName({ projectId, prompt: "fix auth bug" })` | Returns `{ branchName: "fix-auth-bug" }` or similar (requires API key in host-service env) |
| Call with empty prompt | Returns `{ branchName: null }` |
| Call with no API key in env | Returns `{ branchName: null }` (graceful fallback) |

## Known Regressions (documented, accepted)

- **OAuth-only users** (Claude Max / OpenAI Codex without stored API key) get random branch names and prompt-derived workspace titles for small-model tasks. Main chat retains full OAuth.
- **Provider-diagnostics banners removed** from Settings > Models. "Needs attention" for capability-specific issues (missing scope, quota exceeded) no longer surfaces. Auth-level issues (expired, disconnected) still show.
