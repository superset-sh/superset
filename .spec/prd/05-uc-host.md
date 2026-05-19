---
stability: mixed (CONSTITUTION + FEATURE_SPEC — see 03-functional-groups.md)
last_validated: 2026-05-18
prd_version: 1.0.0
functional_group: HOST
---

# Use Cases: Host-Service Lifecycle & IPC Security (HOST)

| ID | Title | Source Finding | Layer |
|----|-------|----------------|-------|
| UC-HOST-01 | Allowlist preload `ipcRenderer` channels | V2-H6 + v1 carry-over | CONSTITUTION |
| UC-HOST-02 | Authorize coordinator mutations against caller's org | V2-H4 | CONSTITUTION |
| UC-HOST-03 | Add `protectedProcedure` + `orgScopedProcedure` middleware to desktop tRPC | V2-H4 infra | CONSTITUTION |
| UC-HOST-04 | Authenticate `notifications.hook` and validate `terminalId` | V2-H5 | CONSTITUTION |
| UC-HOST-05 | Rotate PSK on every spawn + encrypt manifest at rest | V2-M7 | CONSTITUTION |
| UC-HOST-06 | Document production CORS posture and gate `allowedOrigins` to dev | V2-M10 | FEATURE_SPEC |
| UC-HOST-07 | Walk transitive import graph in `no-electron-coupling.test.ts` | V2-H14 | CONSTITUTION |
| UC-HOST-08 | Drain in-flight turns on `before-quit` before SIGTERM | V2-H7 + V2-M8 | FEATURE_SPEC |
| UC-HOST-09 | Move `ChatService` (OAuth loopback + auth storage) out of host-service | V2-H15 | CONSTITUTION |
| UC-HOST-10 | Decide and execute v1 stack deprecation | V2 GA-blocking decision | FEATURE_SPEC |

---

## UC-HOST-01: Allowlist preload `ipcRenderer` channels

**Description**: Replace the open `invoke/send/on/off` relay at `apps/desktop/src/preload/index.ts:32-59` with an explicit channel allowlist so neither v1 nor v2 renderers (which share this preload) can reach arbitrary `ipcMain` handlers. Addresses V2-H6 and the v1 CRITICAL-1 carry-over that still applies to v2 windows.

**Acceptance Criteria**:
- ☐ A maintainer can audit every channel the renderer is permitted to call by reading a single `ALLOWED_CHANNELS` set in `apps/desktop/src/preload/index.ts`.
- ☐ The renderer can no longer invoke any channel that is not in the allowlist — calls to non-listed channels reject synchronously in preload with a clear error before reaching `ipcMain`.
- ☐ All existing v1 + v2 renderer code paths (chat, terminal, browser, workspaces, settings, TanStack SQLite persistence) continue to work because their channels are explicitly enumerated.
- ☐ A developer can extend the allowlist by adding a single entry; no other preload code changes are required.
- ☐ A reviewer can see in the commit diff that `exposeElectronTRPC()` still runs before any `contextBridge.exposeInMainWorld()` call (preload ordering invariant preserved).
- ☐ A user opening DevTools and calling `window.ipcRenderer.invoke("arbitrary:channel")` sees the call rejected with an error message that surfaces in the UI with `select-text cursor-text` classes if it bubbles up.

---

## UC-HOST-02: Authorize coordinator mutations against caller's org

**Description**: Convert `publicProcedure` on `host-service-coordinator/index.ts:15,27,32,37,49,61` to `orgScopedProcedure` that asserts `session.activeOrganizationId === input.organizationId`. Addresses V2-H4 (any compromised renderer can SIGKILL any org's host-service via `reset`).

**Acceptance Criteria**:
- ☐ A renderer authenticated for org A cannot call `hostServiceCoordinator.restart({ organizationId: "B" })` and gets a typed `UNAUTHORIZED` (or `FORBIDDEN`) tRPC error.
- ☐ A renderer authenticated for org A cannot call `hostServiceCoordinator.reset({ organizationId: "B" })` and the SIGKILL path is never reached.
- ☐ All coordinator procedures (`start`, `restart`, `reset`, `getConnection`, `getProcessStatus`, `onStatusChange`) enforce org-scoping via the same shared middleware (no duplication).
- ☐ `onStatusChange` subscription emits only events for orgs the caller is authenticated against (events for other orgs are filtered out).
- ☐ A unit test calls `appRouter.createCaller(ctxWithOrgA).hostServiceCoordinator.reset({ organizationId: "B" })` and asserts it throws `FORBIDDEN`.

---

## UC-HOST-03: Add `protectedProcedure` + `orgScopedProcedure` middleware to desktop tRPC

**Description**: `apps/desktop/src/lib/trpc/index.ts:59-61` currently exports only `publicProcedure` — there is no auth middleware at all on the Electron IPC tRPC layer. Introduce `protectedProcedure` (requires authenticated session) and `orgScopedProcedure` (requires `input.organizationId` to match the authenticated session) as reusable primitives. Blocking infrastructure for UC-HOST-02 and future hardening.

**Acceptance Criteria**:
- ☐ A developer can import `{ orgScopedProcedure, protectedProcedure }` from `apps/desktop/src/lib/trpc` alongside `publicProcedure`.
- ☐ The middleware resolves the active session via the existing `loadToken()` + cloud-API identity path the coordinator already uses, so existing auth state drives the check.
- ☐ Subscriptions composed with `orgScopedProcedure` filter emitted events by the caller's authorized org IDs (no cross-org event leakage).
- ☐ The Sentry middleware continues to wrap every procedure (extend, not replace, `sentryMiddleware`).
- ☐ A developer running typecheck sees compile errors at every `publicProcedure` call site in the host-service-coordinator router until they migrate to the scoped variant (validates UC-HOST-02 completion).

---

## UC-HOST-04: Authenticate `notifications.hook` and validate `terminalId`

**Description**: `packages/host-service/src/trpc/router/notifications/notifications.ts:18-22,52-54` is intentionally `publicProcedure` with `terminalId: z.string().optional()` and is reachable through the relay tunnel. The response-shape difference between found/not-found terminals (`ignored: true|false`) is an enumeration oracle, and `eventType`/`agentIdentity` payloads can be forged cross-workspace. Addresses V2-H5.

**Acceptance Criteria**:
- ☐ A caller without a valid short-lived HMAC token scoped to the workspace's terminal cannot post to `notifications.hook` and receives `401`.
- ☐ `terminalId` is validated as `z.string().uuid()`; non-UUID payloads are rejected before any DB lookup.
- ☐ The shell-hook installer writes the HMAC token into the agent shell's env at terminal creation time, scoped to that terminal ID — the renderer never has to forward the host PSK.
- ☐ The response shape no longer differs between "terminal found" and "terminal not found" in a way that lets an external caller enumerate terminal IDs.
- ☐ The relay path forwards `Authorization` headers end-to-end so HMAC validation works through the tunnel.
- ☐ A developer reading `notifications.ts` can see a comment justifying the procedure's protection level and explaining the HMAC's scope and lifetime.

---

## UC-HOST-05: Rotate PSK on every spawn + encrypt manifest at rest

**Description**: `apps/desktop/src/main/lib/host-service-manifest.ts:34-47` persists the host-service PSK plaintext to `~/.superset/host/{orgId}/manifest.json` (mode 0o600 only). On shared macOS systems, iCloud-synced home directories, or Dropbox-style storage, the PSK is reachable outside the process lifetime. The coordinator already mints `randomBytes(32)` per spawn (`coordinator.ts:444`) — the missing piece is rotation policy + at-rest encryption. Addresses V2-M7.

**Acceptance Criteria**:
- ☐ A new PSK is minted on every fresh spawn (already true) AND on every `reset` flow — adopted instances may keep the existing manifest secret only when the manifest itself can be decrypted by the OS keychain.
- ☐ The manifest file on disk no longer contains a plaintext `authToken` — the field is replaced by a ciphertext blob sealed by `safeStorage` from Electron (macOS Keychain / Windows DPAPI / libsecret).
- ☐ A user inspecting `~/.superset/host/{orgId}/manifest.json` with `cat` sees only ciphertext for the auth-token field.
- ☐ A second user on the same shared/iCloud-synced home cannot extract the PSK because their keychain can't decrypt the blob.
- ☐ Adoption code unseals the PSK via `safeStorage` before health-checking; failure to decrypt is treated identically to a missing manifest (respawn with a fresh PSK).
- ☐ A `safeStorage.isEncryptionAvailable()` precheck guards the seal/unseal path; if the OS does not support it (rare Linux configs), the coordinator falls back to a per-boot ephemeral PSK and logs a single warning rather than persisting plaintext.

---

## UC-HOST-06: Document production CORS posture and gate `allowedOrigins` to dev

**Description**: `apps/desktop/src/main/host-service/index.ts:48-51` configures `allowedOrigins: [http://localhost:VITE_PORT, http://127.0.0.1:VITE_PORT]`, but production renderers run at `file://` and Chromium omits the `Origin` header — Hono's CORS middleware never fires. PSK is the sole real auth in production. Addresses V2-M10.

**Acceptance Criteria**:
- ☐ A developer reading `apps/desktop/src/main/host-service/index.ts` sees a comment explicitly stating: "In production, `Origin` is absent on `file://` renderers and CORS does NOT gate this surface — PSK in `Authorization: Bearer` is the sole auth."
- ☐ The `allowedOrigins` array is dev-only (gated on `!app.isPackaged`); production passes an empty array (or `origin: false`) so a forged `Origin` header from a third-party process cannot bypass.
- ☐ `apps/desktop/docs/host-service-trust-model.md` (or sibling) documents the v2 chat trust model: loopback bind to 127.0.0.1 + filesystem PSK distribution + PSK is sole real auth.
- ☐ A regression test sends a request with a forged `Origin: http://attacker.example` to the loopback port without a valid PSK header and asserts it still rejects.

---

## UC-HOST-07: Walk transitive import graph in `no-electron-coupling.test.ts`

**Description**: `packages/host-service/src/no-electron-coupling.test.ts:18-49` only scans `.ts` files inside `packages/host-service/src/` for direct Electron patterns. It misses imports from `@superset/chat/server/desktop` which transitively pulls `ChatService` and OAuth loopback code into the bundle. The test passes green while the invariant is violated. Addresses V2-H14.

**Acceptance Criteria**:
- ☐ The test resolves and walks the actual import graph reachable from `packages/host-service/src/index.ts`, not just files in `src/`.
- ☐ A regression that adds a new import of `@superset/chat/server/desktop` or any module that transitively touches `electron` fails the test with a path showing the chain (e.g., `host-service/src/app.ts → @superset/chat/server/desktop → mastracode/auth → electron`).
- ☐ The slash-command helpers currently imported through `@superset/chat/server/desktop` are extracted into a new pure-function package (e.g., `@superset/slash-commands` or `@superset/chat/shared`) so host-service can import them without dragging `ChatService` along.
- ☐ Alternative implementation accepted: a post-build smoke test that greps the bundled host-service output (`bun build src/serve.ts`) for `electron`, `BrowserWindow`, `ipcMain`, `@superset/chat/server/desktop` is acceptable if the import-graph walker is infeasible. The implementer picks one and documents the choice.
- ☐ The test fails today (proving it catches the real regression) and passes after UC-HOST-09 lands.

---

## UC-HOST-08: Drain in-flight turns on `before-quit` before SIGTERM

**Description**: `HostServiceCoordinator.child.on("exit")` reacts by emitting `status: stopped` and clearing state, but there is no drain step. On Electron `before-quit` (and on the last v2 window close for an org), the coordinator must call `chat.stop` for every active session before SIGTERM. Backstop for V2-H7 / V2-M8 — pairs with renderer-side UC-V2UI-07.

**Acceptance Criteria**:
- ☐ On Electron `before-quit`, the coordinator calls a new `drain(organizationId)` method that posts `chat.stop` to host-service for every active session before SIGTERM.
- ☐ The drain has a bounded timeout (default 5 seconds); after that, SIGTERM proceeds and the coordinator emits `status: stopped`.
- ☐ A renderer that has unmounted mid-turn (per UC-V2UI-07) sees `chat.stop` reach host-service via either the renderer's cleanup effect OR (as a backstop) via the coordinator's drain on next shutdown.
- ☐ Drain progress is observable in logs (number of sessions drained, timeouts).
- ☐ A unit test simulates 3 active sessions and `before-quit`, asserts all 3 `chat.stop` calls fire before the timeout, asserts SIGTERM happens after.

---

## UC-HOST-09: Move `ChatService` (OAuth loopback + auth storage) out of host-service

**Description**: `packages/host-service/src/app.ts:4,117` constructs `ChatService` (OAuth loopback HTTP servers, `mastracode` auth storage) inside the headless Bun process. The renderer-driven OAuth flow can't complete from a remote-tunnel deployment, and two paths now write to mastra's shared auth storage (last-writer-wins race). Addresses V2-H15 and unblocks UC-HOST-07.

**Acceptance Criteria**:
- ☐ A developer reading `packages/host-service/src/app.ts` sees no `ChatService` import — auth orchestration is owned exclusively by Electron main.
- ☐ Electron main owns the OAuth loopback HTTP server (new module under `apps/desktop/src/main/lib/auth/`) and writes resolved credentials to a Keychain-sealed store.
- ☐ Host-service receives resolved provider credentials via an IPC handshake at spawn time (extends `SpawnConfig`) AND via a `creds.refresh` IPC channel for in-session refresh (consumed by UC-RUN-08).
- ☐ The `host.auth.*` tRPC routes either move to Electron-main tRPC OR remain on host-service but proxy through to Electron via the handshake — the new contract is documented in `apps/desktop/docs/host-service-auth-contract.md`.
- ☐ `LocalModelProvider.resolveAnthropicCredential` reads from a single injected credential source rather than `mastracode`'s `createAuthStorage` directly — no more last-writer-wins.
- ☐ A user can still complete the Anthropic OAuth flow from a v2 window; the loopback redirects to a real browser window owned by Electron.
- ☐ A user with a remote (tunneled) workspace can still authenticate because the OAuth flow runs entirely on their desktop, not on the remote host.

---

## UC-HOST-10: Decide and execute v1 stack deprecation

**Description**: `apps/desktop/src/lib/trpc/routers/index.ts:35-36` still registers `chatRuntimeService` and `chatService` v1 routers. The v2 cut-over is opt-in. This decision is GA-blocking for the polish work because the blast radius of UC-HOST-01 (preload allowlist must enumerate v1 channels) and UC-HOST-09 (ChatService extraction may leave a desktop-main equivalent v1 still needs) depends on it.

**Acceptance Criteria**:
- ☐ A team decision is written to `apps/desktop/docs/v1-deprecation-decision.md` (or `.spec/decisions/`): either (a) v1 is deprecated on a dated milestone and the v1 routers are scheduled for removal, or (b) v1 + v2 coexist permanently and both share the hardened preload + tRPC contract.
- ☐ If (a): `chatRuntimeService` and `chatService` routers are removed from `routers/index.ts`, corresponding files are deleted, and downstream UCs (UC-HOST-01 allowlist, UC-HOST-09 ChatService extraction) reflect the simplified surface.
- ☐ If (b): both v1 and v2 chat surfaces enforce the new `orgScopedProcedure` + preload allowlist; a migration test asserts behavioral parity for overlapping surfaces.
- ☐ The decision artifact is referenced from `README.md` and from any UC whose scope it changes.
- ☐ The user-visible cutover plan (if a) is documented: soft-flag → forced upgrade on a release boundary OR rollout via feature flag.
