---
source: ticket
improvement_id: SUPER-750
ticket_id: SUPER-750
ticket_url: https://linear.app/superset-sh/issue/SUPER-750/cli-auth-login-dont-open-a-browser-in-cross-device-ssh-cases-fall-back
tracker: linear
status: proposal
investigator_specialist: bun-reviewer
challenger_specialist: code-reviewer
extra_consultants:
  - security-reviewer
---

# SUPER-750: CLI auth login — fall back cleanly to paste on cross-device

## Defect

`superset auth login` runs two concurrent flows: a loopback flow (binds a local TCP port, opens a browser, browser pings the local callback) and a paste flow (user visits a URL and pastes back a `code#state` token). On local machines both flows can complete, and whichever finishes first wins.

In remote / SSH / Superset-workspace contexts, the browser opens on the remote host (not the user's local machine), so the loopback port the CLI bound is on a different network than the user's browser. The loopback callback can never arrive; the paste flow is the only viable path. Daniel Vega (Inversion Semiconductor) hit exactly this on an EC2 box: `superset auth login` opened a browser tab on the EC2 host, the generated link failed in Safari, and he had to abort and use `--api-key` instead.

The three concrete gaps driving the failure: (1) `shouldOpenBrowser()` does not recognize Superset remote-workspace contexts (`SUPERSET_WORKSPACE_ID`) or Linux headless (`DISPLAY` unset); (2) `bindLoopbackServer()` is called unconditionally even when the browser won't open, wasting a TCP port for 5 minutes; (3) there is no `--no-browser` flag for users who need to force paste-only mode explicitly.

## Reproduction / Evidence

**Evidence:** `.spec/improvements/SUPER-750/evidence.md`

Static trace with file:line proof of every gap. No live EC2 available; the trace is complete and verifiable from source alone.

## Root cause

### Gap 1 — `shouldOpenBrowser()` incomplete detection

**`packages/cli/src/lib/auth.ts:58-62`**

```typescript
function shouldOpenBrowser(): boolean {
    if (!process.stdout.isTTY) return false;
    if (process.env.CI) return false;
    if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return false;
    return true;
}
```

Missing checks:
- `process.env.SUPERSET_WORKSPACE_ID` — set by host-service at `packages/host-service/src/terminal/env.ts:185` in every Superset remote workspace terminal. Not checked here.
- Linux headless: `process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY`. Not checked anywhere in `packages/cli/src/` (confirmed by grep).

### Gap 2 — `bindLoopbackServer()` called before browser decision

**`packages/cli/src/lib/auth.ts:295`** — `bindLoopbackServer()` is called unconditionally.
**`packages/cli/src/lib/auth.ts:319`** — `shouldOpenBrowser()` is evaluated 24 lines later.

Even when `shouldOpenBrowser()` would return `false`, the loopback server has already been bound and a listener registered. The server lives for the full `CALLBACK_TIMEOUT_MS` (5 min, `auth.ts:10`) before being cleaned up in `finally` at `auth.ts:414`.

### Gap 3 — No `--no-browser` flag

**`packages/cli/src/commands/auth/login/command.ts:148-155`** — `options` object has only `organization` and `apiKey`. There is no escape hatch for users in contexts where detection is incomplete.

### Gap 4 — UI copy misleads in paste-primary path

**`packages/cli/src/commands/auth/login/LoginUI.tsx:99`** and **`command.ts:218`** — both paths read "Browser didn't open? Use the url below to sign in." In a cross-device flow where the browser is intentionally skipped, this copy implies a browser attempt happened.

## Specialist consultation summary

- **Ink TUI (LoginUI.tsx):** Copy change is a single `<Text>` line swap. No Ink-specific layout concern. I (bun-reviewer) am confident in the Ink change; no TUI specialist consultation needed.
- **Security-reviewer:** Deferred. The orchestrator will dispatch security-reviewer as a separate consultant. Items for security-reviewer to confirm:
  1. Does skipping `bindLoopbackServer()` in cross-device mode change the PKCE/state validation surface area? (The loopback callback validates `state` at `auth.ts:143-148`; paste validates state at `auth.ts:377-381`. Both remain. But confirm no PKCE downgrade risk.)
  2. Is there any attack surface difference between a loopback server that never receives a callback (current cross-device behavior) vs. no server at all (proposed)?
  3. `--no-browser` flag: does a user-controlled flag to skip browser create a phishing-adjacent risk? (Probably not — the paste URL is still PKCE-protected — but security-reviewer to confirm.)

## File overlap warnings

Pre-flight scan of all active worktrees against `packages/cli/src/lib/auth.ts`:

| Worktree | Overlap | Nature |
|----------|---------|--------|
| `super-752-HOST-AUTH-002` | **HIGH** | Refactors `auth.ts` structurally — moves `LoginResult` interface and `refreshAccessToken` to `@superset/shared/auth/token-refresh`. This is a structural change to the same file. If super-752 merges before SUPER-750, the implementer must rebase. |
| `super-752-HOST-AUTH-003` | **HIGH** | Touches `auth.ts` + `resolve-auth.ts` + `logout/command.ts`. Same structural refactor chain as HOST-AUTH-002. |
| `super-752-HOST-AUTH-001`, `super-752-HOST-AUTH-004` | MEDIUM | Same `LOGIN_AGAIN_SUGGESTION` constant removal diff — cosmetic. Will conflict trivially. |
| `SUPER-753-chat-start-flicker` | MEDIUM | Same cosmetic `LOGIN_AGAIN_SUGGESTION` diff. |
| `SUPER-783-automation-new-workspace-target` | MEDIUM | Same cosmetic `LOGIN_AGAIN_SUGGESTION` diff. |
| `improvement-SUPER-771`, `chat-v2`, `feat-web-dev-email-signin`, `skills`, `skills-hooks`, `skills-pr`, `skills-tsgo`, `justinrich-chatbugs`, `mobile-deps-upgrade`, `sprint-1-chat-mobile-storybook-sessions`, `imp-tsgo-fallow-agent-hooks-1779421907`, `imp-xterm-webgl-macos-fallback-1779419095`, `chat-polish-spec` | LOW | Same cosmetic `LOGIN_AGAIN_SUGGESTION` removal diff — trivial conflict. |
| `imp-drop-login-slash-1747923600` | NONE | Does not touch auth.ts — touches slash-commands and agent-identity only. |
| `super-752-host-auth-refresh` | NONE | Does not touch auth.ts on main..HEAD diff. |

**Critical:** `super-752-HOST-AUTH-002` is the highest-risk overlap. It restructurally refactors `auth.ts` to re-export `LoginResult` and `refreshAccessToken` from a shared package. If that lands on main before this PR, the implementer must rebase `shouldOpenBrowser()` changes onto the new structure.

## Option A — minimum

**one_line:** Widen `shouldOpenBrowser()` to detect `SUPERSET_WORKSPACE_ID` and Linux headless (`DISPLAY`/`WAYLAND_DISPLAY`); move `bindLoopbackServer()` call inside the browser-open branch so it is skipped in cross-device contexts.

**files_in_scope:**
- `packages/cli/src/lib/auth.ts` (lines 58-63 detection predicate; lines 284-322 `login()` restructure to gate loopback bind)

**loc_budget:** ~12 additions, ~4 deletions = ~16 LOC delta

**acceptance_criteria:**
- AC-1: With `SUPERSET_WORKSPACE_ID` set in env, `shouldOpenBrowser()` returns `false` (unit-testable by importing the function or testing the integration path).
- AC-2: With `SSH_CONNECTION` set, behavior is unchanged (existing coverage confirmed).
- AC-3: On Linux with `DISPLAY` and `WAYLAND_DISPLAY` both unset, `shouldOpenBrowser()` returns `false`.
- AC-4: When `shouldOpenBrowser()` returns `false`, `bindLoopbackServer()` is NOT called (no port bind occurs — verifiable by checking no port in the 51789–51793 range is occupied after login starts in paste-only mode).
- AC-5: `pasteAuthorizeUrl` is surfaced via `onAuthorizationUrl` callback regardless of browser decision (already true at `auth.ts:317`; regression test to confirm it stays true).
- AC-6: Paste flow completes successfully in cross-device mode (end-to-end: env with `SUPERSET_WORKSPACE_ID` set, user pastes code, token exchanged).

**out_of_scope:**
- `--no-browser` flag
- UI copy changes in `LoginUI.tsx` or `command.ts`
- `openBrowser()` error handling
- Safari redirect investigation

**risks:**
- If `SUPERSET_WORKSPACE_ID` is ever set in a local context (e.g., a workspace pointing to localhost), the browser will be suppressed unnecessarily. Mitigation: check the BRIEF — host-service only sets this in workspace terminal sessions, which by definition run on the host machine. Local-only use does not set this variable.
- Merge conflict with `super-752-HOST-AUTH-002` which restructures the same `auth.ts`. Implementer must verify no structural conflict post-rebase.
- Security surface change (no loopback server bound): deferred to security-reviewer to confirm no PKCE regression.

---

## Option B — moderate

**one_line:** Option A plus a `--no-browser` boolean flag on `auth login` and updated paste-primary UI copy when the flag is set or cross-device is detected.

**files_in_scope:**
- `packages/cli/src/lib/auth.ts` (detection + loopback gate, same as Option A)
- `packages/cli/src/commands/auth/login/command.ts` (add `noBrowser: boolean()` option; thread flag into `login()` call)
- `packages/cli/src/lib/auth.ts` or `LoginCallbacks` interface (add `noBrowser?: boolean` param to `login()`)
- `packages/cli/src/commands/auth/login/LoginUI.tsx` (copy: "Browser didn't open?" → "Open the link below to sign in" when in paste-primary mode)

**loc_budget:** ~35 additions, ~8 deletions = ~43 LOC delta

**acceptance_criteria:**
- AC-1 through AC-6 (all from Option A)
- AC-7: `superset auth login --no-browser` skips browser open and loopback bind even on a local TTY where `shouldOpenBrowser()` would otherwise return `true`.
- AC-8: In paste-primary mode (cross-device detected OR `--no-browser` set), `LoginUI` shows "Open the link below to sign in" (not "Browser didn't open?").
- AC-9: `command.ts` non-Ink path also updates message: "Open the link below to sign in" (not "Browser didn't open? Use the url below").

**out_of_scope:**
- `shouldOpenBrowser()` typed-reason refactor (strategic only)
- Safari redirect investigation
- `openBrowser()` error handling

**risks:**
- All risks from Option A, plus:
- UI copy change in `LoginUI.tsx` touches Ink rendering — minor risk, but the change is a single `<Text>` swap with no layout implications.
- `--no-browser` flag introduces a user-controlled bypass. Security-reviewer to confirm no phishing-adjacent risk (PKCE remains; URL is still authenticated).
- Moderate scope means 3 files vs 1; merge conflict surface is wider.

---

## Option C — strategic

**one_line:** Option B plus extract detection into a typed `crossDeviceReason()` function returning `'tty'|'ssh'|'remote-workspace'|'no-display'|'override'|'browser-ok'` so future additions are a one-line enum extension, and UI copy branches on the specific reason.

**files_in_scope:**
- All files from Option B
- `packages/cli/src/lib/auth.ts` (replace `shouldOpenBrowser(): boolean` with `crossDeviceReason(): CrossDeviceReason` exported type + function)
- Possibly a new `packages/cli/src/lib/browser-detection.ts` to keep `auth.ts` focused

**loc_budget:** ~65 additions, ~15 deletions = ~80 LOC delta

**acceptance_criteria:**
- AC-1 through AC-9 (all from Options A + B)
- AC-10: `crossDeviceReason()` is exported and unit-testable; returns the correct reason literal for each env combination.
- AC-11: UI copy branches on reason — `'ssh'` shows "SSH session detected", `'remote-workspace'` shows "Superset workspace detected", `'no-display'` shows "No display found", `'override'` shows "--no-browser flag set".

**out_of_scope:**
- Safari redirect investigation
- `openBrowser()` error handling

**risks:**
- All risks from Option B, plus:
- Exporting a new type from `auth.ts` may conflict with `super-752-HOST-AUTH-002` which re-exports types from that file.
- Typed-reason enum is an abstraction that may not pay off if detection needs never expand. Prematurely over-engineered for a 3-context detection list.
- **Flag this as separate-sprint material.** Option C should NOT be included in a single PR with Options A or B. The typed-reason refactor is clean, but it's an architectural nicety, not a fix for Daniel's bug. Recommend: ship Option B, file Option C as a follow-on refactor ticket.

---

## Deferred follow-ups

See `.spec/improvements/SUPER-750/follow-ups.md` — 3 deferred items:
1. **FU-1:** Safari OAuth redirect failure (separate investigation — not caused by this change)
2. **FU-2:** `--no-browser` flag (if Option A is chosen, this becomes a follow-on ticket)
3. **FU-3:** `openBrowser()` silent failure on Linux — fire-and-forget `void` at `auth.ts:320`
