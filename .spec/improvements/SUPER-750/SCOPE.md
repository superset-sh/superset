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

---

## Challenge

### Ground truth re-verification

- **`packages/cli/src/lib/auth.ts:58-62/58-63`** — `shouldOpenBrowser()` body: VERIFIED. Lines 58-63 in actual file (58 = function declaration, 59-62 = body, 63 = closing brace). SCOPE.md body cites `58-62`; evidence.md cites `58-63`. Minor inconsistency, not a hallucination. PASS.
- **`packages/cli/src/lib/auth.ts:295`** — `const loopback = await bindLoopbackServer();`: VERIFIED. Exact line 295.
- **`packages/cli/src/lib/auth.ts:319`** — `if (shouldOpenBrowser()) {`: VERIFIED. Exact line 319.
- **`packages/cli/src/commands/auth/login/command.ts:148-155`** — options object with only `organization` and `apiKey`: VERIFIED.
- **`packages/cli/src/commands/auth/login/LoginUI.tsx:99`** — `<Text>Browser didn't open? Use the url below to sign in </Text>`: VERIFIED.
- **`packages/host-service/src/terminal/env.ts:185`** — `env.SUPERSET_WORKSPACE_ID = workspaceId`: VERIFIED.

All citations confirmed. Status: **PASS**. No hallucination detected. Frontmatter status stays `proposal`.

### Smaller-option search

**Option Z proposed.**

Option A has two parts: (1) widen `shouldOpenBrowser()` (+3 LOC), and (2) gate `bindLoopbackServer()` inside the browser-open branch (~13 LOC restructuring of `login()`).

Part 2 can be omitted. The wasted loopback port (5 min on localhost, ports 51789-51793) is invisible to users. Nobody reaches it. The `finally` block at `auth.ts:414` cleans it up cleanly. The loopback server resource cost is negligible. Omitting the gate means no restructuring of `login()` — the change is purely additive to `shouldOpenBrowser()`.

Additionally, the `DISPLAY`/`WAYLAND_DISPLAY` check can be deferred. Daniel's specific bug is Superset workspace context. `SSH_CONNECTION` already handles plain SSH. The headless Linux case (bare EC2 without SSH or workspace) is a different scenario that can be a follow-up.

**Option Z: add only `SUPERSET_WORKSPACE_ID` check to `shouldOpenBrowser()`. ~1 LOC addition.**

Arguments against omitting the loopback gate: a bound port is observable by port scanners; binding a listener that can never succeed is wasteful design. Both are real but secondary to the user-visible fix.

See `## Option Z (challenger-proposed)` section below.

### Does minimum resolve the problem?

**Technical resolution: YES.** With Option A (or Option Z):
1. `shouldOpenBrowser()` returns `false` in Superset workspace terminal contexts.
2. No browser opens on the remote host.
3. `callbacks.onAuthorizationUrl(pasteAuthorizeUrl)` fires unconditionally at `auth.ts:317` — paste URL is always surfaced.
4. User sees the URL and paste prompt; login completes via paste flow.

**UX completeness concern (MODERATE, not blocking):**

The "Browser didn't open?" copy at `LoginUI.tsx:99` and `command.ts:218` is rendered/logged unconditionally, regardless of whether a browser was attempted. With Option A, no browser was attempted — the message is factually incorrect. It implies an attempt happened and failed.

In the Ink path: the paste URL displays in cyan immediately below the "Browser didn't open?" header. The paste field is present. A user who sees the URL follows it. In the non-Ink clack path: the URL and paste prompt follow immediately after the misleading log line. In both cases the flow completes.

**Verdict: Option A resolves Daniel's bug technically. The copy is UX-imprecise but not UX-blocking. A cross-device user still sees the URL and completes login. However, for customer-facing quality, Option B's copy change is warranted — the current copy implies a browser attempt failed when none was made. Option B should be the actual minimum for an external customer shipping context.**

### Scope creep flags in moderate/strategic

**Option B (UNDERSPECIFIED, not creep):**
- `packages/cli/src/commands/auth/login/LoginUI.tsx:6-12` (`LoginUIProps` interface) — a `pasteOnly?: boolean` prop (or equivalent) is required for AC-8 but is NOT listed in `files_in_scope`. Also: `command.ts:185-195` (currentProps initialization + update() calls) must pass this prop — an unlisted touchpoint. The scope description for Option B understates the thread depth by one interface touchpoint.
- `packages/cli/src/lib/auth.ts:19-22` (`LoginCallbacks` interface) — the `noBrowser?: boolean` addition is described vaguely. This is a required touchpoint. Not creep, just underspecified.

**Option C (genuine creep):**
- `packages/cli/src/lib/browser-detection.ts` (possibly new file) — not required for any AC. AC-10 can be satisfied by adding `crossDeviceReason()` to `auth.ts` directly. Do not create a new file.
- AC-11 (reason-specific UI copy: "SSH session detected", "Superset workspace detected", etc.) is scope beyond AC-8's simpler copy change. Approximately 8-10 additional LOC in `LoginUI.tsx` and `command.ts` with marginal user-visible benefit. File as follow-on if ever needed.
- Option C confirmed as separate-sprint material. The investigator's recommendation to not merge it with A or B is correct.

### File-overlap independent assessment

Read `super-752-HOST-AUTH-002` worktree's `packages/cli/src/lib/auth.ts` directly. The diff from main is:

1. Lines 4, 7-8 added: `import type { LoginResult }` from shared package + two re-export lines at file top. These shift subsequent line numbers by approximately +2 (one `LOGIN_AGAIN_SUGGESTION` constant line is also removed, partially canceling the shift).
2. `shouldOpenBrowser()` function body: IDENTICAL to main — same 4-line structure, no changes.
3. `login()` function body: IDENTICAL to main — same unconditional `bindLoopbackServer()` call, same `shouldOpenBrowser()` eval, same structure throughout.

**The HIGH overlap rating is overstated. Actual severity: MEDIUM.**

The conflict is a line-number offset (~+2), not a structural incompatibility. SUPER-750's changes touch `shouldOpenBrowser()` and `login()` — both of which are IDENTICAL in the 752 worktree. A rebase will almost certainly auto-merge cleanly. The investigator rated HIGH based on the change description ("structural refactor") rather than the actual diff content.

### Recommendation

Ship **Option B**: fixes Daniel's bug, corrects the misleading "Browser didn't open?" copy for intentionally-paste-primary flows, adds `--no-browser` escape hatch, costs ~43 LOC. File Option C as a follow-on. Use Option Z only if Option B is blocked by timeline.

---

## Option Z (challenger-proposed): smaller-than-minimum

**one_line:** Add only `SUPERSET_WORKSPACE_ID` check to `shouldOpenBrowser()`. No loopback-bind gating, no `DISPLAY` check, no copy changes, no `--no-browser` flag.

**files_in_scope:**
- `packages/cli/src/lib/auth.ts` (lines 58-63: add one check to `shouldOpenBrowser()`)

**loc_budget:** ~1 addition, 0 deletions = 1 LOC delta

**acceptance_criteria:**
- AC-Z1: With `SUPERSET_WORKSPACE_ID` set in env, `shouldOpenBrowser()` returns `false`.
- AC-Z2: Paste flow completes in Superset workspace context (no browser opened, user pastes code, token exchanged — same as Option A's AC-6).

**out_of_scope:**
- Linux `DISPLAY`/`WAYLAND_DISPLAY` headless detection (follow-up)
- `bindLoopbackServer()` gating (wasted port is user-invisible; defer)
- `--no-browser` flag (follow-up)
- UI copy changes
- `openBrowser()` error handling

**risks:**
- Does NOT fix headless Linux (non-SSH, non-workspace EC2) — `xdg-open` still silently fails in that context.
- Loopback port still bound in cross-device mode (invisible to users, cleaned up after 5 min).
- "Browser didn't open?" copy still misleads when no browser was attempted.
- These risks make Option Z appropriate only under timeline pressure. Option B is preferred.

---

## Security review

### Findings

- **(Q1 PKCE/state surface)** — No regression. `codeVerifier`, `codeChallenge`, and `state` are all generated at `auth.ts:291-293`, before `bindLoopbackServer()` at `auth.ts:295`. The paste path validates `state` at `auth.ts:378` and passes `codeVerifier` to `exchangeCodeForToken()` at `auth.ts:404-408`. The loopback server contributes no PKCE material and holds no session state the paste path lacks. Removing it for cross-device contexts introduces zero PKCE downgrade. Both flows use `code_challenge_method=S256` (`buildAuthorizeUrl()`, `auth.ts:194`) and the same `codeVerifier` for token exchange. CONFIRMED: identical security posture in paste-only path.

- **(Q2 loopback-removed surface)** — Removing the loopback server **closes** a narrow attack surface. Current behavior: `waitForCallback()` at `auth.ts:119-156` accepts any HTTP request to `http://127.0.0.1:{port}/callback`. `state` is validated at `auth.ts:143-148`, but only after code+state are extracted from the request URL. On a multi-user shared host, a local attacker who learns the port (observable via `ss -tlnp`) and the `state` value (visible in the authorization URL echoed to stdout at `auth.ts:317`) could craft a request. `state` entropy is 256 bits (`randomBytes(32)`, `auth.ts:37-39`) — not remotely guessable — but on a shared host `state` could be extracted from stdout scraping or `/proc/{pid}/fd/`. Even if an attacker sends a request with a valid stolen `state` and a fabricated `code`, `exchangeCodeForToken()` at `auth.ts:201-245` posts the fabricated code to the real OAuth server, which rejects it. The code forging attack fails at the server. Removing the loopback server entirely eliminates the attack surface while the OAuth server's code validation remains as a backstop.

- **(Q3 --no-browser phishing risk)** — Low risk, contained by PKCE. The paste flow is PKCE-bound: a `code` from the OAuth server can only be redeemed by a client possessing the `code_verifier` (`auth.ts:291`), held exclusively in CLI process memory. An attacker who tricks a user into pasting an attacker-controlled `code#state` cannot redeem it — `exchangeCodeForToken()` uses the CLI's `code_verifier`, which the attacker does not have. The pasted `state` is validated against the session-generated state at `auth.ts:378` — codes from different sessions fail immediately. Residual UX footgun: the paste interaction ("paste this thing you receive") trains users in a habit that is dangerous in weaker OAuth systems without PKCE. Not exploitable in this codebase but is a pattern risk.

- **(Q4 superset-cli OAuth client)** — No impact. `CLIENT_ID = "superset-cli"` at `auth.ts:6` is a public client with no secret. PKCE (`code_challenge_method=S256`) was designed for exactly this pattern. Option B's changes are orthogonal to the client registration model — the public client + S256 PKCE combination is intact in all paths.

- **(Q5 Option B specifics)** — One underspecification gap found in AC-9. The non-Ink copy path at `command.ts:218` (`p.log.message("Browser didn't open? Use the url below to sign in")`) must update for two distinct conditions: (a) `shouldOpenBrowser()` returns `false` (auto-detected cross-device), and (b) `--no-browser` flag is set explicitly. AC-9 says "non-Ink path also updates message" but does not enumerate both triggers. An implementer could satisfy AC-9 by updating only one branch and missing the other. No new security vulnerabilities are introduced by the `noBrowser?: boolean` addition to `LoginCallbacks` or `pasteOnly?: boolean` to `LoginUIProps`.

### Smaller-secure-option check

- Option Z (1-LOC `SUPERSET_WORKSPACE_ID` check, no loopback gating) is secure. The retained loopback server adds no new exploitable surface beyond what already exists on main today. Option Z's security posture is identical to current main.

### Regression risk in Option A/B

- Net assessment: **improvement** — removing `bindLoopbackServer()` in cross-device contexts eliminates the narrow loopback request-injection vector described in Q2. No regression in PKCE or state validation is introduced by either option. The paste path's cryptographic security was always equivalent to the loopback path's; gating the loopback bind on browser intent removes a resource and a listener that provided no security benefit in cross-device contexts.

### Recommended additional ACs (Option B binding)

- AC-10 (security): The non-Ink log at `command.ts:218` must update copy for **both** conditions independently: (a) `shouldOpenBrowser()` returns `false` (auto-detected cross-device), and (b) `--no-browser` flag is set. AC-9 currently implies this but does not enumerate both trigger conditions, creating an implementation gap.

### Recommended additional risks (Option B binding)

- Paste-habit footgun (LOW): shipping `--no-browser` normalizes a "run with flag, paste back what you receive" interaction. In this codebase the risk is contained (PKCE prevents code theft). In future flows where a weaker grant type is added, this trained pattern becomes dangerous. Mitigation: display the authorization domain explicitly in the paste-primary UI (e.g., "Signing in to app.superset.sh — visit the link below") so users have a visual domain anchor before pasting. Not a blocking risk for Option B but should be noted in the implementation brief.
