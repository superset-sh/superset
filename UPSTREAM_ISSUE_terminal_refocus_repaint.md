## Summary

Returning to a terminal pane after switching app focus / window / workspace can still leave the terminal in a partially stale visual state even after the underlying text content has recovered.

In my local repro with Codex CLI running inside Superset Desktop on macOS, the most visible symptom was that the TUI content could repaint, but some terminal chrome remained stale for a beat longer than the text layer. In practice this showed up as blank strips / stale repaint artifacts, and in some runs the Codex input box styling lagged behind the recovered content.

This looks like a separate renderer lifecycle problem from the attach-time snapshot/socket overlap bug. The pane content itself may no longer be duplicated or shifted, but a single focus-time `fit() + refresh()` pass can still miss the final settled layout after the window becomes visible again.

## Environment

- Superset Desktop: built from current `main` as of 2026-04-10
- macOS: Apple Silicon
- Repro app inside terminal: Codex CLI

## Reproduction

1. Open a terminal pane in Superset Desktop.
2. Start Codex CLI or another full-screen / dense TUI.
3. Switch away from the app or switch workspaces/tabs long enough for the pane to fully unmount/occlude.
4. Return to the same terminal pane.
5. Observe that the text content may recover, but the terminal can still briefly retain stale visual state from before focus returned.

## Expected behavior

When the terminal becomes visible again, the entire pane should repaint into a fully consistent final state in one restore cycle, including terminal background/chrome and TUI styling.

## Actual behavior

- content can recover first
- stale blank space or stale visual styling can remain briefly afterward
- a single recovery pass on `window.focus` / `visibilitychange` does not always seem to be enough once layout finishes settling

## Suspected area

`apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`

Specifically the focus / visibility recovery path around:

- `clearTextureAtlas()`
- `fitAddon.fit()`
- `xterm.refresh()`
- resize reporting after refocus

My local patched build stopped reproducing once I changed the restore path to run a short recovery burst instead of a single pass:

- immediately on visibility/focus restore
- again after ~120ms
- again after ~260ms

That suggests the terminal container is still settling for a short period after focus is restored, so a single repaint can happen too early.

## Related issues

- #1830
- #1873
- #2507
- #2968
- #3080
- #3208
- #3309

I am opening a PR with the small recovery-burst change that fixed the repro locally.
