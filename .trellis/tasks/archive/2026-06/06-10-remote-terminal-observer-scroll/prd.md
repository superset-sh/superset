# Fix remote terminal observer scrolling

## Goal

Remote terminal sessions rendered from another host can stream output, but the observer machine cannot scroll the terminal viewport while the host machine can. Fix scroll handling for remote terminal panes without regressing local terminal interaction.

## Requirements

- Remote terminal panes opened from a different host must support wheel and trackpad scrolling through terminal history.
- Local terminal panes on the owning host must keep their existing scroll/input behavior.
- Streaming remote output must continue to render live and must still follow the bottom when the user is already at the bottom.
- If the observer has intentionally scrolled up, incoming output must not immediately force the viewport back to the bottom.
- The fix must avoid brittle host-name special cases; it should work for any remote host-service terminal session.

## Acceptance Criteria

- [ ] A remote terminal session created on another machine can be opened on this machine and scrolled with mouse wheel or trackpad.
- [ ] The same terminal remains scrollable and interactive on the owning machine.
- [x] New terminal output is still visible in real time on both machines.
- [x] Local terminal panes continue to pass existing terminal tests.
- [x] The change is covered by a focused unit/component test or a deterministic helper test where practical.

## Notes

- Reported during dev validation after remote cross-machine execution started working.
- The symptom is viewport-only: remote output streams, but observer-side scrolling does not move through history.
- Accident-scene inspection on Mac mini showed wheel focus was inside xterm, but `.xterm-viewport.scrollHeight === clientHeight`; the observer had no scrollback to scroll.
- The inspected terminal was hosted by the work computer (`MBP-LDJ7Y1JQCT-0524`), so Mac mini dev changes cannot affect that live session until the host-side app is updated.
- Follow-up attempts that added host-side replay snapshots caused terminal blank-screen regressions on both observer and owning machines. Those changes were reverted, and this task is intentionally paused at the original "remote observer cannot scroll history" behavior.

## Validation

- Rollback validation passed: `bun test apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.test.ts packages/host-service/src/terminal/terminal-mode-tracker.test.ts packages/host-service/src/terminal/env.test.ts`.
- Caveat: the remote observer scrolling issue remains unresolved by design. Future work should start with a deterministic long-scrollback observer harness before changing replay behavior again.
