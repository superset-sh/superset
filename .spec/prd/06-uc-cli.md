---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
functional_group: CLI
---

# Use Cases: CLI & Host Service Auth (CLI)

| ID | Title | Linear |
|----|-------|--------|
| UC-CLI-01 | Refresh and surface host-service auth across OAuth token expiry | [SUPER-752](https://linear.app/superset-sh/issue/SUPER-752) |
| UC-CLI-02 | Use the paste flow exclusively in cross-device `superset auth login` contexts | [SUPER-750](https://linear.app/superset-sh/issue/SUPER-750) |

---

## UC-CLI-01 — Refresh and surface host-service auth across OAuth token expiry

**Linear:** [SUPER-752](https://linear.app/superset-sh/issue/SUPER-752) — High

`superset auth login` provisions an OAuth token that the host service uses to authenticate to the cloud and the relay. Today `packages/cli/src/lib/host/spawn.ts` passes `AUTH_TOKEN: options.sessionToken` into the child-process env once, and `packages/host-service/src/serve.ts`'s `JwtApiAuthProvider({ getSessionToken })` returns that same frozen env var forever. After ≈1 hour the OAuth access token expires and every relay/cloud call 401s with no signal. `superset start` also never validates the auth session before spawning the host. This UC gives the host a refreshable credential, surfaces expiry loudly when refresh fails, and gates `superset start` on a live session.

### Acceptance Criteria

- ☐ System can refresh the host service's OAuth access token automatically when the cached token expires, reusing the same `refreshAccessToken` (5-min leeway) logic that `resolve-auth.ts:32-56` already implements for CLI commands
- ☐ Host service consumes a refreshable credential (refresh token or path to the CLI config) rather than a frozen `AUTH_TOKEN` env-var snapshot from `spawn.ts:106-121`
- ☐ User can see a clear, copy-pasteable status message ("Superset session expired — run `superset auth login`") in the desktop app and the CLI when the host service's refresh fails (refresh token revoked or expired)
- ☐ System emits a status event (not an unhandled rejection / crash) when refresh fails — the failure surfaces as state the UI can render, not a tunnel crash
- ☐ `superset start` refuses to spawn the host service when no valid auth session can be resolved, with the standard "Run: superset auth login" hint
- ☐ User can recover by running `superset auth login` and have the host service pick up the new credential without a full `superset start` restart, when the design allows
- ☐ Host-service code path `JwtAuthProvider.getJwt()` (`packages/host-service/src/providers/auth/JwtAuthProvider/JwtAuthProvider.ts:42-77`) no longer passes a `looksLikeJwt` OAuth access token straight through unrefreshed
- ☐ Integration test verifies that an expired-then-refreshed token path keeps the relay tunnel alive end-to-end with no 401s

---

## UC-CLI-02 — Use the paste flow exclusively in cross-device `superset auth login` contexts

**Linear:** [SUPER-750](https://linear.app/superset-sh/issue/SUPER-750) — Medium

`superset auth login` supports two flows: a loopback flow (opens a local browser → browser pings a localhost callback) and a paste flow (user opens a link, pastes `code#state` back into the terminal). The loopback flow breaks for remote / SSH cases — the browser opens on a different machine than the CLI, so the localhost callback is unreachable. `shouldOpenBrowser()` in `packages/cli/src/lib/auth.ts:57-62` already gates on `SSH_CONNECTION` / `SSH_TTY` / CI / non-TTY, but it misses Superset remote workspaces and missing `DISPLAY` on Linux. This UC extends the detection, skips `bindLoopbackServer()` when known cross-device, presents the paste flow as primary in those cases, and adds a `--no-browser` override.

### Acceptance Criteria

- ☐ Remote User can run `superset auth login` over SSH and have the CLI present the paste flow as the primary path without eagerly opening a browser tab
- ☐ System detects Superset remote workspace contexts (host-service / workspace env markers) as cross-device and routes to the paste-only flow
- ☐ System detects missing `DISPLAY` on Linux and routes to the paste-only flow
- ☐ Remote User can force paste-only mode by passing `--no-browser` to `superset auth login`, even on a machine the CLI would otherwise treat as local
- ☐ System does not call `bindLoopbackServer()` (`packages/cli/src/lib/auth.ts:296-322`) when the context is known cross-device — no doomed port binding
- ☐ User can still use the loopback flow on a true local context (no SSH, has `DISPLAY` or is on macOS / Windows) — no regression for the common case
- ☐ Remote User sees clear copy in the terminal (Ink `LoginUI.tsx` or `@clack/prompts` fallback) explaining that the browser will not open and they should paste the code
- ☐ Engineer (Internal) records a written cross-device detection list referencing Anthropic's CLI heuristic for parity, plus an explicit note that the Safari `[query.response_type] Invalid input` symptom is verified-not-regressed (out of scope to fix)
