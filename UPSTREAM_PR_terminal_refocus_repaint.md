## Summary

- add a short recovery burst when a terminal becomes visible again after focus / visibility changes
- keep the existing throttle logic, but retry repaint/fit twice after the initial restore attempt
- add a regression test that models the new burst behavior

## Why

The existing terminal restore path already does the right kinds of work on refocus:

- clear the WebGL texture atlas
- re-fit the terminal to its container
- force an xterm refresh

The remaining problem is timing. In practice, one refocus recovery can still happen slightly before the terminal container has fully settled after the app/window/workspace becomes visible again. That leaves stale blank space or stale terminal/TUI styling until some later repaint happens.

Running a short recovery burst fixed the repro locally:

- immediate restore
- second restore after ~120ms
- third restore after ~260ms

This keeps the change small and local to the focus/visibility recovery path, while giving xterm another chance to repaint once layout has actually stabilized.

## Test plan

- `bun test ./src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.test.ts`

## Related

- Closes #3321
- Related: #1830
- Related: #1873
- Related: #2507
- Related: #2968
- Related: #3080
- Related: #3208
- Related: #3309
