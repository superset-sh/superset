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
| Send a chat message | Chat succeeds silently (token auto-refreshed via `authStorage.getApiKey`). No "Reconnect" prompt. |
| If refresh token is also invalid | Falls to expired state, "Expired" badge + "Reconnect" button appears |
| Check terminal for `[chat-service] Anthropic OAuth refresh failed` | Logged if refresh fails |

## 5. Settings > Models Page

| Step | Expected |
|---|---|
| Navigate to Settings > Models | Page loads with Anthropic + OpenAI sections, each with provider icon in header |
| Each provider shows a single card with OAuth row + API Key row | OAuth row: label + badge + action. API Key row: input + contextual buttons |
| **Disconnected state** | "Not connected" badge, primary "Connect" button, no Save/Clear buttons |
| **API key flow**: type key → Save appears → click Save | "API key updated" toast, "Active" badge, "Logout" button appears |
| **API key flow**: click Clear | Key removed, badge reverts to "Not connected" |
| **OAuth flow**: click Connect → complete in browser | "Active" badge, "Logout" button |
| **OAuth flow**: click Logout | Badge reverts, Connect button returns |
| **API key + OAuth**: set API key, then connect OAuth, then disconnect OAuth | API key should survive the OAuth cycle (backup/restore workaround) |
| **OpenAI dialog** auto-opens browser on Connect | No manual "Open browser" step needed |
| **Copy URL** button shows "Copied!" feedback for 2s | — |

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
- **Upstream dependency**: API key storage slot collision with OAuth is worked around via backup/restore. Proper fix tracked at mastra-ai/mastra#15483.
