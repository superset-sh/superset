---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-19
prd_version: 1.0.0
---

# Justin Cycle 28 — Chat UI, Automations & Reliability

## Product Description

Superset is a desktop + CLI environment that runs AI coding agents inside isolated workspaces, with local and cloud-backed runtimes connected over a relay tunnel. The "Justin" Linear project for Cycle 28 collects the cross-cutting punch list that has accumulated against three of the most heavily-used surfaces — the v2 chat pane, the automations product, and the CLI / host-service auth handshake — plus two desktop UX papercuts that block daily use (browser-pane Cmd+W, diff-viewer line numbers).

This PRD turns those ten tickets into a single, fully-shippable initiative scoped around what the user sees, hears, and survives when these flows go wrong.

## Problem Statement

The v2 chat stack and its supporting infrastructure each carry one or more failure modes that bleed user trust:

1. **The chat transport disagrees with itself.** v2 chat polls `getDisplayState` and `listMessages` independently at 4 fps; the two sources race on turn boundaries, and the dedupe/optimistic-reconciliation code that papers over the race produces a visible flicker and a briefly-duplicated assistant message at the start of every new session.
2. **The chat architecture has no canonical doc.** Three in-repo plans describe overlapping designs for the v2 transport; the team has no single source of truth to build against.
3. **The chat builtin slash command surface is wrong on purpose.** `/login` claims to "authenticate a provider" but silently opens the model picker; the broader builtin set was assembled ad hoc and no one has decided what should stay.
4. **The composer footer looks cluttered.** Three separate pill buttons (permission mode, model, thinking level) sit in a row when one consolidated menu would read cleaner.
5. **Automations fail silently.** `RelayDispatchError` is squashed into a clipped tooltip in the runs list; paid automations die without notification, retry, or a legible error string. The "New workspace" target — the *expected* default for scheduled runs — also fails to actually create a workspace at dispatch time.
6. **The CLI host service breaks on a one-hour timer.** `superset start` snapshots an OAuth access token into a child-process env var and never refreshes it; ~1 hour later every relay/cloud call 401s with no surfacing, and there's no auth check at startup so a host can be launched with an already-expired session.
7. **CLI auth login can't survive an SSH session.** The loopback flow eagerly opens a browser tab that can't reach the localhost callback when the CLI is running on a remote box (e.g., EC2), and there's no clean fallback to the paste flow.
8. **Cmd+W destroys work in browser panes.** Pressing Cmd+W inside a browser pane closes the entire BrowserWindow instead of just the focused pane, because the keystroke is captured by the Electron application-menu accelerator before it reaches the renderer.
9. **The diff viewer mis-numbers its own lines.** Line numbers render out of order, breaking the most basic reviewing affordance.

## Solution Summary

Ship a coherent set of fixes that together raise the floor on Superset's reliability surfaces:

- **Chat:** Land the canonical v2 chat transport + state architecture (single doc, single `ChatEvent` protocol, single push-based stream replacing the dual-poll), implement that stream for the new-session start flow so the flicker / duplication disappears, decide and correct the builtin slash command set (starting with `/login`), and collapse the composer's three pill buttons into one menu.
- **Automations:** Surface automation run failures loudly (popup/notification, full error messages on the runs row), and make the "New workspace" target actually spin up a clean workspace at dispatch time with a clear error path when it can't.
- **CLI / host service:** Give the host service a refreshable credential and a loud expiry surface, gate `superset start` on a live session, and teach the CLI's `auth login` to detect cross-device contexts (SSH, remote workspace, missing DISPLAY) and present only the paste flow — plus an explicit `--no-browser` override.
- **Desktop UX:** Intercept Cmd+W on focused browser-pane `webContents` and route it through the existing pane-close handler (v1 and v2). Fix the diff-viewer line numbering so old-side and new-side numbers render sequentially within each hunk.

Each fix is a discrete, mergeable PR; the PRD enables PR sequencing because the chat work (UC-CHAT-01 → UC-CHAT-04) is naturally stacked.
