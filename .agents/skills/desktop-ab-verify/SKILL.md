---
name: desktop-ab-verify
description: Verify a desktop bug fix or PR with a real before/after reproduction in the running app over CDP. Use when asked to verify, reproduce, or A/B a desktop fix end-to-end, or to prove a reported bug actually reproduces before trusting a fix.
---

# Desktop A/B verification

Goal: the reported failure must actually happen on the unfixed build, and stop happening on the fixed one, under the same observations. A passing synthetic check is not verification. Read `apps/desktop/AGENTS.md` (CDP section) and the `## CDP UI Verification` rules in the root `AGENTS.md` first.

## 1. Launch and prove you own the instance

Launch from the worktree with a unique port — never assume 9222, other workspaces run concurrently:

```bash
RENDERER_REMOTE_DEBUG_PORT=<port> bun run dev:desktop > /tmp/dev.log 2>&1   # background
lsof -nP -iTCP:<port> -sTCP:LISTEN -t                                       # then ps the pid
```

The pid's command must contain **your** worktree path, and the page target URL must use this worktree's `DESKTOP_VITE_PORT` from `.env`. If the port was taken at launch, Electron starts with no debugger and you silently drive someone else's app. A responding CDP endpoint alone proves nothing.

Drive it with a small script: poll `<port>/json` for the `page` target, connect a WebSocket, then `Runtime.evaluate` (`awaitPromise`, `returnByValue`) and `Page.captureScreenshot`. xterm uses a canvas renderer, so screenshots — not DOM text — are what show terminal content.

## 2. Reach the code path, not just the app

Confirm which surface actually executes the code under test before driving anything. The two terminal stacks are unrelated:

- `apps/desktop/src/main/terminal-host/**` — v1 panes, onboarding `gh auth` dialog, remote-agent launchers. Framing lives in `pty-subprocess-ipc.ts`.
- `packages/host-service` + `packages/pty-daemon` — all v2 workspace terminals. Different decoder (`pty-daemon/src/protocol/framing.ts`).

For a v1-only path, flip the surface and reload: `localStorage["v2-local-override-v2"] = '{"state":{"optInV2":false},"version":0}'`, remove `v1-migration-*` keys. v1 boots slowly — a blank screenshot at 15s means "still booting", so re-probe before diagnosing.

## 3. Pick an oracle that cannot lie

Prefer a **plain shell pane** over an agent TUI. A shell echoes input and prints command output; Codex/Claude TUIs collapse large pastes into `[Pasted Content N chars]`, redraw asynchronously, and will make a live session look dead.

Bind to the pane's terminal object to read its buffer:

```js
const m = await import('/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache.ts');
const t = m.get('<paneId>').xterm;   // pane ids come from daemon.log "Creating/attaching session: pane-..."
```

Pane ids are not in localStorage — grep the daemon log. Re-bind after any relaunch or pane restore ("Session Contents Restored"): a stale `xterm` object silently accepts `input()` and reports nothing.

Paste gotchas, all encountered for real:

- A `\n` inside a paste does **not** submit under bracketed paste — dispatch a trusted `Input.dispatchKeyEvent` Enter (`key`+`text:"\r"`) separately.
- Control characters inside a paste are filtered; a stray `~` in the buffer is the bracketed-paste terminator echoing. Send a real interrupt via `terminal.input("\x03")`.
- Trusted single-character key events often don't land while Enter does; synthetic `ClipboardEvent("paste")` on `.xterm-helper-textarea` is the reliable text path.

Verify the oracle before the experiment: run the baseline command and see its output. Then assert on **command output**, not the echoed command line.

## 4. Get daemon-side ground truth

The UI hides most of the story. `~/.superset-<worktree>/daemon.log` carries the v1 terminal-host session logs, and renderer console lines land in `~/Library/Logs/Superset (<worktree>)/main.log`. Count and *fingerprint* errors, don't just check presence — the shape often distinguishes the bug from its symptom. In #6153, one identical repeated value meant a poisoned decoder re-reading a stale header, while many distinct values meant it was resyncing correctly between fresh corruptions.

## 5. Escalate to a real-process harness when the UI can't deliver

Layers above may cap or drop your input before it reaches the code under test (a 2 MB client-notify cap hid this bug for several attempts). Drive the real class against the real built binary instead of mocking:

```ts
new Session({ /* … */ spawnProcess: (_c, _a, opts) => spawn(ELECTRON, [DIST_SUBPROCESS], opts) })
```

`Session` accepts a `spawnProcess` injection, so everything but the UI layer stays genuine. Label such runs as semi-synthetic and keep at least one true UI repro alongside.

## 6. A/B correctly

`git checkout main` fails when main is checked out in another worktree. Revert **only** the implementation file instead: `git checkout main -- <impl file>`, relaunch, re-run the identical script, then `git checkout HEAD -- <impl file>`. Main-process changes need a full stack relaunch per side; renderer-only changes need just `location.reload()`.

Never `git stash push -- <file>` on a file with no changes: the push is a no-op and a later `git stash pop` pops an unrelated pre-existing entry. Check `git status` first, and if you do clobber someone's stash, re-stash it immediately with a labeled message.

## 7. Confirm the tests can fail

Revert the fix hunk and re-run the new tests — they must fail, with the failure naming the real defect. Tests that pass both ways prove nothing. Restore afterwards.

## 8. Clean up

Kill only your own tree (`pkill -f <worktree-path-fragment>`), then confirm the ports are free. Teardown leaves orphans holding the API/Vite ports (`next-server` on `API_PORT` is the usual one) and the next launch dies with `EADDRINUSE`; verify a candidate pid's `cwd` is your worktree before killing it. Never touch another agent's debugging port.

## Report

State plainly which checks were end-to-end and which were synthetic, whether screenshots were actually captured, and pair the before/after numbers from the same measurement. If the failure did not reproduce, say exactly what was tried — do not present a synthetic pass as verification.
