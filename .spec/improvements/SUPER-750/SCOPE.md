---
source: ticket
improvement_id: SUPER-750
ticket_id: SUPER-750
ticket_url: https://linear.app/superset-sh/issue/SUPER-750/cli-auth-login-dont-open-a-browser-in-cross-device-ssh-cases-fall-back
tracker: linear
status: binding
chosen_option: moderate
loc_budget: 50
task_chunks: 1
investigator_specialist: bun-reviewer
challenger_specialist: code-reviewer
extra_consultants:
  - security-reviewer
---

# SUPER-750: CLI auth login — fall back cleanly to paste on cross-device

## Defect

`superset auth login` runs two concurrent flows: a loopback flow (binds a local TCP port, opens a browser, browser pings the local callback) and a paste flow (user visits a URL and pastes back a `code#state` token). On local machines both flows can complete, and whichever finishes first wins.

In remote / SSH / Superset-workspace contexts, the browser opens on the remote host (not the user's local machine), so the loopback port the CLI bound is on a different network than the user's browser. The loopback callback can never arrive; the paste flow is the only viable path. Daniel Vega (Inversion Semiconductor) hit exactly this on an EC2 box: `superset auth login` opened a browser tab on the EC2 host, the generated link failed in Safari, and he had to abort and use `--api-key` instead.

The concrete gaps driving the failure: (1) `shouldOpenBrowser()` does not recognize Superset remote-workspace contexts (`SUPERSET_WORKSPACE_ID`) or Linux headless (`DISPLAY` unset); (2) `bindLoopbackServer()` is called unconditionally even when the browser won't open, wasting a TCP port for 5 minutes (and constituting a narrow attack surface on shared hosts); (3) there is no `--no-browser` flag for users to force paste-only mode explicitly; (4) UI copy ("Browser didn't open?") misleads in intentionally-paste-primary flows.

## Reproduction / Evidence

**Evidence:** `.spec/improvements/SUPER-750/evidence.md`

Static trace with file:line proof of every gap. No live EC2 available; the trace is complete and verifiable from source alone. Challenger independently re-verified all line citations against the actual worktree source — PASS.

## Root cause

### Gap 1 — `shouldOpenBrowser()` incomplete detection

**`packages/cli/src/lib/auth.ts:58-63`**

```typescript
function shouldOpenBrowser(): boolean {
    if (!process.stdout.isTTY) return false;
    if (process.env.CI) return false;
    if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return false;
    return true;
}
```

Missing checks:
- `process.env.SUPERSET_WORKSPACE_ID` — set by host-service at `packages/host-service/src/terminal/env.ts:185` in every Superset remote workspace terminal. Not checked.
- Linux headless: `process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY`. Not checked anywhere in `packages/cli/src/`.

### Gap 2 — `bindLoopbackServer()` called before browser decision

`bindLoopbackServer()` at `auth.ts:295` is called unconditionally, 24 lines before `shouldOpenBrowser()` is evaluated at `auth.ts:319`. The server lives for the full `CALLBACK_TIMEOUT_MS` (5 min) before cleanup in the `finally` at `auth.ts:414`. Security review found this is also a narrow attack surface on shared hosts (loopback HTTP handler accepts any request; `state` could be extracted from stdout scraping on a multi-user box). Skipping the bind in cross-device contexts closes this surface.

### Gap 3 — No `--no-browser` flag

`packages/cli/src/commands/auth/login/command.ts:148-155` — `options` object has only `organization` and `apiKey`. No escape hatch for contexts where detection is incomplete.

### Gap 4 — UI copy misleads in paste-primary path

`LoginUI.tsx:99` and `command.ts:218` both read "Browser didn't open? Use the url below to sign in." In a cross-device flow where the browser is intentionally skipped, this copy implies a browser attempt happened.

## Binding scope (chosen: Option B — moderate)

Widen `shouldOpenBrowser()` detection (`SUPERSET_WORKSPACE_ID` + Linux `DISPLAY`/`WAYLAND_DISPLAY`); gate `bindLoopbackServer()` inside the browser-open branch so it is skipped in cross-device contexts; add a `--no-browser` CLI flag; update UI copy on the paste-primary path.

### Files in scope

- `packages/cli/src/lib/auth.ts`
  - Lines 58-63: widen `shouldOpenBrowser()` predicate
  - Lines 19-22 (or wherever `LoginCallbacks` is declared): add `noBrowser?: boolean` field
  - Lines 284-322: restructure `login()` to gate `bindLoopbackServer()` on the same predicate that gates `openBrowser()`
- `packages/cli/src/commands/auth/login/command.ts`
  - Lines 148-155: add `noBrowser: boolean()` to the `options` object
  - Lines 175-246: thread `noBrowser` from parsed args through to the `login()` call
  - Lines 185-195 (or equivalent currentProps init + `update()` block): pass `pasteOnly` to `LoginUI`
  - Line 218: update non-Ink copy (see AC-9 + AC-10)
- `packages/cli/src/commands/auth/login/LoginUI.tsx`
  - Lines 6-12 (or wherever `LoginUIProps` is declared): add `pasteOnly?: boolean` prop
  - Line 99: branch the copy on `pasteOnly` ("Open the link below to sign in" vs current "Browser didn't open?")

### Acceptance criteria

- **AC-1**: With `SUPERSET_WORKSPACE_ID` set in env, `shouldOpenBrowser()` returns `false`.
- **AC-2**: With `SSH_CONNECTION` or `SSH_TTY` set, behavior is unchanged (existing path; regression-test only).
- **AC-3**: On Linux with both `DISPLAY` and `WAYLAND_DISPLAY` unset, `shouldOpenBrowser()` returns `false`.
- **AC-4**: When `shouldOpenBrowser()` returns `false`, `bindLoopbackServer()` is NOT called (no port bind in the 51789–51793 range when paste-primary mode is active).
- **AC-5**: `pasteAuthorizeUrl` is surfaced via the `onAuthorizationUrl` callback regardless of browser decision (already true at `auth.ts:317`; regression-test it stays true).
- **AC-6**: Paste flow completes end-to-end in cross-device mode (env with `SUPERSET_WORKSPACE_ID` set; user pastes code; token exchanged successfully).
- **AC-7**: `superset auth login --no-browser` skips browser open AND loopback bind even on a local TTY where `shouldOpenBrowser()` would otherwise return `true`.
- **AC-8**: In paste-primary mode (auto-detected cross-device OR `--no-browser` set), `LoginUI` displays "Open the link below to sign in" (not "Browser didn't open?"). Driven by a new `pasteOnly?: boolean` prop on `LoginUIProps`.
- **AC-9**: In paste-primary mode, the non-Ink `@clack/prompts` fallback path at `command.ts:218` logs "Open the link below to sign in" (not "Browser didn't open? Use the url below").
- **AC-10** *(security)*: AC-9's copy update at `command.ts:218` must fire for **both** trigger conditions independently and equivalently: (a) `shouldOpenBrowser()` returns `false` (auto-detected cross-device), AND (b) `--no-browser` flag is set. An implementer must not satisfy AC-9 by updating only one branch.

### Out of scope

- Typed `CrossDeviceReason` enum refactor (Option C — separate sprint, file as follow-on if detection grows)
- Reason-specific UI copy ("SSH session detected" vs "Superset workspace detected" — Option C, AC-11)
- Safari OAuth redirect failure (FU-1 — separate ticket; not caused by this code)
- `openBrowser()` silent-failure error handling (FU-3 — separate follow-up)
- `superset-cli` OAuth client refactor / Dynamic Client Registration migration
- Token storage / `resolve-auth.ts` changes
- Any change to `buildAuthorizeUrl()` (`auth.ts:177-198`) — both URLs already use `response_type=code` and S256 PKCE consistently

### Risks

- **Local-context false suppression**: if `SUPERSET_WORKSPACE_ID` is ever set in a context where the workspace IS local to the user (e.g., dev-mode workspace pointing to localhost), the browser will be suppressed unnecessarily. Mitigation: host-service only sets this in workspace terminal sessions, which by definition run on the host machine. Pure-local CLI use does not set this variable. AC-7 (`--no-browser`) and the inverse case (no env override exists to force browser ON) are accepted asymmetries.
- **Merge conflict with `super-752-HOST-AUTH-002`**: that worktree adds imports and re-exports at the top of `auth.ts`. Challenger's independent re-read confirms HIGH was overstated; actual severity is **MEDIUM**. The 752 worktree leaves `shouldOpenBrowser()` and `login()` body identical to main, so the conflict is a line-number offset (~+2), expected to auto-merge cleanly. Implementer must rebase and verify.
- **PKCE / state surface**: security-reviewer confirmed **no regression**. Both flows generate `codeVerifier`/`codeChallenge`/`state` at `auth.ts:291-293` before any bind; both paths use `code_challenge_method=S256`; paste path validates state at `auth.ts:378` and exchanges with `codeVerifier` at `auth.ts:404-408`. Skipping the bind actually closes a narrow shared-host attack surface (see Security review).
- **Paste-habit footgun (LOW, security)**: `--no-browser` normalizes a "run with flag, paste back what you receive" interaction. In this codebase the risk is contained (PKCE prevents code theft). Mitigation: in paste-primary UI copy, display the authorization domain explicitly so users have a visual anchor (e.g., "Signing in to app.superset.sh — open the link below"). Not blocking; surface to the implementer's brief.
- **Ink copy change**: minor — single `<Text>` swap branched on a new prop. No layout implications.
- **Three-file scope** means a wider merge-conflict surface than Option A; mitigated by all three files being CLI-package-local and on a feature seam with no current PRs in flight.

## Considered alternatives

- **Option A (minimum, ~16 LOC, 1 file)** — Detection widen + loopback gate, no `--no-browser`, no copy change. **Rejected.** Technically resolves Daniel's bug but leaves the "Browser didn't open?" copy on a path where no browser was attempted — UX-imprecise enough that customer-facing quality bar is not met. Also no escape hatch for contexts the detection misses.

- **Option C (strategic, ~80 LOC, +1 file)** — Option B plus typed `CrossDeviceReason` enum + reason-specific UI copy. **Rejected from this PR.** Investigator and challenger both agree it should NOT ship in the same PR. Typed enum is architectural polish, not a fix. Recommendation: file as follow-on refactor ticket if detection ever needs to grow beyond 3-4 reasons. The speculative new `browser-detection.ts` file is not required for any AC.

- **Option Z (challenger-proposed, ~1 LOC, 1 file)** — Only `SUPERSET_WORKSPACE_ID` check added to `shouldOpenBrowser()`; no loopback gating, no `DISPLAY` check, no flag, no copy. **Rejected.** Technically secure (security-reviewer confirms identical posture to main) and resolves Daniel's primary reported case, but: (a) does not fix headless Linux without SSH, (b) leaves the wasted-port + shared-host attack-surface intact, (c) leaves misleading UX copy in place. Reserved as a timeline-pressure escape hatch only.

## Challenger notes

- **Ground truth re-verification: PASS.** All file:line citations independently confirmed against worktree source. No hallucination.
- **Smaller-than-minimum found** (Option Z) and recorded as an alternative — not adopted.
- **Minimum technically resolves the problem; UX-incomplete.** Daniel-style users would still complete login under Option A, but the "Browser didn't open?" copy implies a failed attempt when none was made. Customer-facing quality argues for Option B's copy fix — this is why B is the binding pick over A.
- **Underspecification flagged** in Option B's `files_in_scope`: `LoginUIProps` interface, `LoginCallbacks` interface, and `command.ts:185-195` thread-through were required touchpoints not enumerated in the proposal. **Folded into binding scope above** under "Files in scope".
- **`super-752-HOST-AUTH-002` overlap re-rated MEDIUM** (was HIGH in proposal). Conflict is a line-number offset, not a structural incompatibility.

## Security review

- **No PKCE/state regression.** Loopback server is transport-only; contributes no PKCE material. Paste path uses the same `codeVerifier`, `state`, and S256 challenge. Removing the bind in cross-device contexts is cryptographically equivalent.
- **Loopback removal is a security IMPROVEMENT** in cross-device contexts. Closes a narrow shared-host attack surface where `state` could be extracted from stdout scraping and replayed against the loopback HTTP handler. OAuth server's code validation is the ultimate backstop (fabricated codes still get rejected), but removing the listener entirely is cleaner.
- **`--no-browser` phishing risk: LOW**, contained by PKCE. CLI's `code_verifier` is in process memory only; attacker-supplied `code#state` cannot be redeemed without it. Residual UX habit risk noted under Risks (paste-habit footgun) with domain-anchor mitigation.
- **`superset-cli` public-client model unaffected.** Public client + S256 PKCE is intact in all paths.
- **AC-9 underspecification** → added AC-10 to enumerate both copy-update triggers.

## Scope amendments

(empty — populated post-binding if scope changes during implementation)

## Deferred follow-ups

See `.spec/improvements/SUPER-750/follow-ups.md` — 3 deferred items:
1. **FU-1**: Safari OAuth redirect failure (separate investigation — not caused by this change)
2. **FU-2**: Typed `CrossDeviceReason` refactor + reason-specific UI copy (Option C — file as follow-on if detection grows)
3. **FU-3**: `openBrowser()` silent failure on Linux — fire-and-forget `void` at `auth.ts:320`
