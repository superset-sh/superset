# Terminal mode replay on reattach

## Bug

Codex TUI (and other kitty-aware TUIs) lose Shift+Enter after a renderer refresh
mid-conversation. Repro confirmed: refresh renderer → Shift+Enter submits
instead of inserting newline.

## Why

- Codex emits `\x1b[>7u` once at startup to enable kitty keyboard protocol.
- xterm.js encodes Shift+Enter as `\x1b[13;2u` only when `kittyKeyboard.flags > 0`.
- Host-service replay buffer is a 64 KiB FIFO (`terminal.ts:159`). Long
  conversations evict the early `\x1b[>7u`.
- On reload, fresh `XTerm` (flags = 0) attaches and replay no longer contains
  the kitty enable. Codex never re-pushes.
- Same class of bug latent for: bracketed paste, focus, mouse, app cursor,
  cursor visibility.

## Prior art

| Project | Backend state | Mode replay | Solves it |
|---|---|---|---|
| VSCode | `@xterm/headless` ingesting PTY | `serialize({ excludeModes: true })` — strips modes intentionally; partial DOM-side workarounds | Partially |
| Tabby | none | none | No |
| Wave | 256 KiB FIFO | none | No |
| cmux | scrollback string | none | No |

VSCode has the right scaffolding (headless xterm on host), wrong policy
(excludes modes from replay).

## Fix

Adopt VSCode's scaffolding, fix the policy:

1. `packages/host-service`: add `@xterm/headless`, feed every PTY chunk to it
   alongside the existing FIFO append.
2. In `replayBuffer` (`terminal.ts:429`), build a preamble from headless state
   and send before the FIFO bytes:
   - kitty: `headless._core.coreService.kittyKeyboard.flags` → `\x1b[=N;1u`
   - bracketed paste: `headless.modes.bracketedPasteMode` → `\x1b[?2004h`
   - focus: `\x1b[?1004h`
   - mouse tracking (x10/vt200/drag/any): `\x1b[?9h` / `?1000h` / `?1002h` /
     `?1003h`. Mouse *encoding* (`?1006`/`?1015`/`?1016`) is **not** covered
     — xterm.js's public `IModes` doesn't expose it. Clients reattaching
     keep the default X10 encoding; revisit if it bites.
   - app cursor: `\x1b[?1h`
   - cursor visibility: `\x1b[?25h/l`
3. Test: pump >64 KiB of arbitrary output through the writer after a kitty
   push, run `replayBuffer`, assert the preamble bytes appear before the FIFO
   bytes.

## Notes

- `@xterm/headless` is a small npm package, Node-compatible, same engine as
  xterm.js so the kitty private accessor matches the renderer.
- Renderer/codex untouched — fix is fully contained in host-service.
- Codex's own self-heal paths (`with_restored`, suspend/resume) already
  re-push on demand, so the new preamble doesn't conflict.

## Out of scope

- xterm.js / SerializeAddon upstream PR to add a `modes` opt-in.
- Compressing/persisting the FIFO across host restarts.
