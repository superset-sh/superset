# Terminal Session Naming Handoff

## Current Status

The terminal-session naming implementation on this branch should be treated as reverted/abandoned. Start from `origin/main` and use this document as context rather than trying to patch the previous approach forward.

The previous implementation mixed three title authorities:

- renderer xterm title events
- host-service session state
- replay-buffer recovery logic

That created fragile reconnect/replay behavior. The next implementation should pick one title authority and keep the other side read-only.

## References Checked Under `~/workplace`

- VS Code (`~/workplace/vscode`)
  - Renderer terminal listens to `xterm.raw.onTitleChange(...)` for VT title sequences.
  - PTY service uses `@xterm/headless` for persistent-session serialization and shell-integration state, not just for live title naming.
  - It tracks title source (`Api`, `Process`, `Sequence`, `Config`) so user/API titles can override process/sequence titles.
- Hyper (`~/workplace/hyper`)
  - Uses renderer xterm `onTitleChange` and forwards that to tab title state.
- Tabby (`~/workplace/tabby`)
  - Uses renderer xterm `onTitleChange` and pushes it into tab title state.
- Ghostty (`~/workplace/ghostty`)
  - Has explicit ConEmu OSC 9 parsing.
  - `OSC 9;3;<title>` means change tab title.
  - `OSC 9;3;` means reset title.
  - Malformed/non-title OSC 9 payloads are not treated as title updates.
- pi-mono (`~/workplace/pi-mono`)
  - TUI title API emits standard `OSC 0;<title>BEL`, which xterm already surfaces through `onTitleChange`.
- WezTerm/Rio
  - Parse title OSCs in the terminal/parser layer and emit title-change events to UI/mux layers.

## Recommended Architecture

Prefer one of these two approaches.

### Option A: Renderer-Only, Lowest Risk

Use the renderer xterm as the only live title parser:

- Listen to `terminal.onTitleChange` for OSC `0`/`2`.
- Register a renderer OSC 9 handler for ConEmu `9;3`.
- Store title on the renderer runtime/transport only.
- Do not send title updates to host-service.
- Do not make replay/title protocol changes.

Tradeoff: detached/background sessions may not have durable titles unless a renderer has already observed them.

### Option B: Host-Authoritative, Durable Titles

Use host-service as the only durable title authority:

- Parse title sequences from PTY output as data arrives.
- Maintain `session.title` in host-service.
- Include title in `listSessions`.
- Send `{ type: "title", title }` on websocket attach.
- Renderer treats server title as read-only UI state.
- Do not send renderer-cached titles back to host on socket open.
- Do not infer authoritative title from replay in the renderer.

This avoids replay races because the host sees title sequences before data is replayed to clients.

For parsing, vendor a small explicit parser rather than adding full `@xterm/headless` just for titles. If exact external code is vendored from Ghostty/WezTerm, do a license check and include attribution. Otherwise, implement the protocol behavior directly:

- OSC starts with `ESC ]`
- terminated by BEL or ST (`ESC \`)
- support standard `0;<title>` and `2;<title>`
- support ConEmu `9;3;<title>` and `9;3;` reset
- tolerate fragmented chunks across PTY `onData` calls
- ignore malformed/incomplete OSCs

Only add `@xterm/headless` if the app also needs full host-side terminal state, serialization, or shell-integration capability tracking. VS Code uses it for that broader job, not as a lightweight title parser.

## Pitfalls From The Abandoned Attempt

- Sending renderer-cached title on websocket open can overwrite a newer host title.
- Suppressing replay title updates can drop the only title if the PTY emitted it before the renderer attached.
- Letting replay update renderer title can flash stale historical titles.
- Adding title metadata to replay messages made the protocol harder to reason about.
- Bidirectional title messages need runtime validation and echo suppression; avoiding bidirectional title messages is simpler.
- UI merge conflicts are likely in `TerminalSessionDropdown`; keep upstream trigger sizing/styling and only add title fallback logic if needed.

## Suggested Tests

- Parser handles OSC `0` and `2`, BEL and ST terminators.
- Parser handles fragmented OSC across chunks.
- Parser handles ConEmu `9;3;<title>` and `9;3;` reset.
- Parser ignores `9;3`, `9;3a`, `9;4`, malformed/incomplete payloads.
- Title normalization strips control chars, trims whitespace, and truncates safely.
- Host authoritative approach: `listSessions` exposes title after PTY output, websocket attach sends current title, replay does not change title authority.
- Renderer-only approach: dropdown updates from live `onTitleChange` and falls back cleanly when no live title exists.
