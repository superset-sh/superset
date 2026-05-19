---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
scope_posture: full
---

# Scope

**Scope Posture:** Full feature — every Linear ticket in the Justin / Cycle 28 list is landed end-to-end, including tests, surfacing copy, and the cross-flow plumbing each item depends on.

## In Scope

- **v2 chat transport + state architecture (UC-CHAT-01 / SUPER-751).** A single canonical doc reconciling `plans/v2-chat-greenfield-architecture.md`, `plans/host-service-chat-architecture.md`, and `plans/chat-mastra-rebuild-execplan.md` — defining `ChatEvent`, `workspace.watch`, `session.watch`, `applyEvent`, and `replayEvents(sessionId, fromSeq, toSeq)`. Scope is transport + state only.
- **Push-based event stream wired into the chat pane (UC-CHAT-04 / SUPER-753).** Replaces the dual `getDisplayState` + `listMessages` polling with a single tRPC WS subscription that folds events into a client-side reducer. Deletes `withoutActiveTurnAssistantHistory()` and the optimistic-message reconciliation dedupe.
- **Canonical builtin slash command set (UC-CHAT-02 / SUPER-754).** Decide which builtins stay, fix `/login` (real provider-auth flow or remove the alias), audit each remaining builtin's action wiring + description, and evaluate a Conductor-style management surface for builtins / MCP.
- **Consolidated composer model-settings menu (UC-CHAT-03 / SUPER-755).** Replace the three sibling pills in `ChatComposerControls` with one trigger button + popover containing the existing `ModelPicker`, `PermissionModePicker`, and `ThinkingToggle` as menu sections.
- **Loud automation run failures (UC-AUTO-01 / SUPER-771).** Surface the full `RelayDispatchError` / dispatch error string on the run row, replace the clipped tooltip in `PreviousRunsList`, and emit a popup / notification when an automation fails.
- **Working "New workspace" automation target (UC-AUTO-02 / SUPER-783).** Repro against a real run, fix whichever of (a) `workspaces.create` relay timeout / failure or (b) missing `v2ProjectId` validation is the actual cause, keep the `__new__` `CommandItem` reachable in the picker, and write a clear failure reason to the `automation_runs` row.
- **Refreshable host-service auth + loud expiry (UC-CLI-01 / SUPER-752).** Replace the frozen `AUTH_TOKEN` env-var snapshot with a refreshable credential (refresh token or CLI config path), surface "Superset session expired — run `superset auth login`" cleanly when refresh fails, and gate `superset start` on a valid session before spawning the host service.
- **Cross-device-aware `superset auth login` (UC-CLI-02 / SUPER-750).** Extend `shouldOpenBrowser()` to detect Superset remote workspaces and missing `DISPLAY` on Linux, skip `bindLoopbackServer()` when context is known cross-device, present the paste flow as the primary path with clear copy, and add a `--no-browser` override.
- **Cmd+W routed to the focused browser pane (UC-UX-01 / SUPER-794).** Intercept Cmd/Ctrl+W via `before-input-event` on each registered guest `webContents` (or drop the File-menu `role: "close"` accelerator), route to `requestPaneClose` (v1) or `closePane` (v2). Preserve `Cmd+Shift+Q` for window close and `Cmd+Shift+W` for full-tab close.
- **Diff-viewer line numbers in correct order (UC-UX-02 / SUPER-804).** Old-side and new-side line numbers render sequentially within each hunk, survive hunk boundaries without resetting incorrectly.
- **Tests** — integration tests for each surfaced failure mode (auth refresh, automation run failure surfacing, new-workspace dispatch, browser-pane Cmd+W routing, diff-viewer numbering) plus a regression test for the chat-start flicker (renders one assistant message, never two).

## Out of Scope

- **Migrating chat off tRPC, rewriting the Mastracode runtime, or adding new chat features** — UC-CHAT-01 is explicitly transport + state only, per SUPER-751.
- **Productizing automations** — the "Automations needs to be productized" follow-up (SUPER-789) is deferred to a separate initiative; this PRD only fixes the silent-failure surfaces and the broken "New workspace" target.
- **Reworking OAuth client registration** — the hand-managed `superset-cli` client row stays as is; refresh-token plumbing reuses the existing flow.
- **Building a generic MCP-management UI** — the Conductor-style management surface evaluation under UC-CHAT-02 is research + a decision, not a full build (a separate ticket will track the build if approved). `[DEFERRED: separate PRD]`
- **Safari-specific cross-browser paste-link debugging** — the `[query.response_type] Invalid input` Safari symptom from SUPER-750 is verified-not-regressed but not actively fixed here. `[DEFERRED: separate PRD]`
- **General chat composer redesign** — UC-CHAT-03 is a presentation-only refactor of three controls into one menu; no new settings, no copy changes outside the consolidated menu.
- **New diff-viewer features** — UC-UX-02 is a numbering correctness fix, not a feature add (no syntax highlighting changes, no inline-comment threading, no side-by-side toggle changes).
- **Cross-platform browser-pane keystroke routing beyond Cmd+W** — UC-UX-01 fixes the specific `role: "close"` accelerator collision; broader webview-vs-renderer keystroke routing audits are out of scope.

## Scope-Size Validation

10 use cases across 4 functional groups, all landed in Cycle 28 against the existing v2 chat stack, automations product, CLI, and desktop. Touches `packages/chat`, `packages/host-service`, `packages/cli`, `packages/trpc`, and `apps/desktop` — five known packages, no new top-level systems. Fits the kb-prd-plan "ONE PRD = ONE Project" rule because every UC ladders up to the same outcome: stop bleeding trust on the daily-driver Superset surfaces in Cycle 28.
