# Agent session handoff

"Continue with another agent" (terminal pane header, fork icon) starts a fresh agent seeded with
the source terminal's conversation. "Fork session" is different: it asks the source harness for a
native fork (`claude --resume <id> --fork-session`) and never reads a transcript.

## Where the transcript comes from

`transcriptSession` in `packages/host-service/src/terminal/terminal.ts` tries each source in turn:

| Order | Source | Used when | Quality |
|---|---|---|---|
| 1 | Harness store (`readHarnessTranscript`) | Claude, while its session is still bound to the terminal | Every user and assistant turn, no tool output |
| 2 | PTY stream replay | Every other agent, or no Claude file found | Whatever the 2 MB output ring still holds. A Claude TUI fills it in well under a minute |
| 3 | Visible screen | Nothing retained | One screen |

The result is capped at `TERMINAL_HANDOFF_MAX_CHARS` (36,000, taken from Orca) and marked
`[earlier output omitted]` when it was cut. Raising it has a ceiling: an argv-transport agent gets
the prompt as one shell argument, and Linux limits one argument to 128 KB.

When a handoff arrives with only the last few seconds of context, the harness store missed and
the stream fallback answered.

## Code layout

| File (under `packages/host-service/src/terminal-agents/`) | Owns |
|---|---|
| `harness-sessions/index.ts` | The store registry, the lookup order, the reported-path check, `readHarnessTranscript`, `hasHarnessSession` |
| `harness-sessions/<harness>.ts` | One `HarnessSessionStore` per harness: where it keeps sessions and how to parse them |
| `harness-sessions/tail.ts` | The bounded, widening read of a session file |
| `harness-session-ref.ts` | `terminalHarnessSession`: a terminal's binding, worktree, reported path and launch env as one `HarnessSessionRef` |
| `agent-config.ts` | `resolveHostAgentConfig` and `agentLaunchEnv`, the account env an agent launches under. The launch and every session lookup use it |
| `transcript-path.ts` | `isTrustedTranscriptPath`, shared with the subagent roster |

The handoff (`transcriptSession`), the CLI's `agents read`, and resume all build their ref with
`terminalHarnessSession`, so they agree on which account's store to read. Fork preflight has no
source terminal and builds its ref from the chosen agent config with the same `agentLaunchEnv`.
The harness comes from the binding, not the config's preset: a custom agent wrapping `claude` has
preset `custom`, but Claude wrote its session.

The subagent pane keeps its own parsers in `subagent-harnesses/`. They clip each entry for
display, which a handoff must not do.

## Finding a session file

The lookup order lives in `readHarnessTranscript` and is the same for every file-backed harness. For
Claude, which keeps one JSONL per session under `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<dir>/`,
it goes:

1. **The path Claude reported.** Every Claude hook payload carries `transcript_path`. The notify
   hook (v20+) forwards it, and the host stores it on `terminal_agent_bindings.transcript_path`.
   This depends on nothing about Claude's layout.
2. **The path the harness's layout gives** (`files.locate`). For Claude: Claude Code 2.1.282 names the directory after the
   working directory, resolved through symlinks and NFC-normalized, with every non-alphanumeric
   UTF-16 unit replaced by `-`. Past 200 characters it truncates and appends
   `Math.abs(javaHash(path)).toString(36)`. `claudeProjectDirName` copies this. It is not a
   documented contract.
3. **A search by session id**, also in `files.locate`. Claude's session ids are UUIDs, so `projects/*/<id>.jsonl` is the session
   wherever it was filed. This catches agents started in a subdirectory,
   `CLAUDE_CODE_PROJECT_DIR_NAME`, and future naming changes.

A miss on all three logs `[harness-sessions] no transcript for claude session …`, and a hit on
2 or 3 logs `found without a reported path`. If the first of those starts appearing in host logs, Claude
has changed its store.

## Trust and staleness

- The hook endpoint is unauthenticated, so a reported path is stored only if
  `isTrustedTranscriptPath` accepts it: absolute, `.jsonl`, and under the user's home. A
  `CLAUDE_CONFIG_DIR` outside home is never stored, and falls through to steps 2 and 3.
- It is stored only while the binding still names the reporting session. It is used only when
  the store's `files.isSessionFile` says it names the bound session (for Claude, `<id>.jsonl`), so a path left behind by an earlier session in the
  same terminal is ignored rather than cleared.
- Reading widens from the last 4 MB until the conversation fills the budget or the file ends,
  stopping at 128 MB. Most of a session file is tool output and screenshots, so a fixed tail
  dropped early turns that would have fit.

## Compatibility

| Combination | Behaviour |
|---|---|
| Old hook (≤ v19), new host | No `transcriptPath` arrives. Lookup starts at step 2 |
| New hook, old host | zod strips the unknown `transcriptPath` field. Nothing changes |
| Bindings created before migration `0036` | `transcript_path` is null until the next hook event from that session |
| Resume and fork preflight (`hasHarnessSession`) | Steps 2 and 3 only, under the env the relaunch will use. A path reported by an earlier launch on another account does not count. Found is `true`. `false` needs the encoded project directory to exist and lack the file. Otherwise `null` (unknown, allowed) |

## Adding a harness

Write `harness-sessions/<harness>.ts` exporting a `HarnessSessionStore` and register it in
`HARNESS_SESSION_STORES`:

- `files`, for a store that keeps one file per session: `isSessionFile` (does a path name this
  session) and `locate` (find it under `env`). The reported-path check and the lookup order then
  come for free.
- `files.parseTurns`, to make handoffs read the conversation instead of the terminal stream. It
  gets a chunk that may start mid-line and must skip what it cannot parse.
- `hasSession`, only when absence can be proven. Without it a located file is `true` and
  anything else `null`. Return `false` only when certain, because `false` refuses a fork.

If the harness's hook payload carries `transcript_path`, the notify hook already forwards it.

## Not covered

- Only Claude has `parseTurns`. Codex, OpenCode, pi and the rest hand off from the PTY stream.
- Handing over a conversation longer than the 36,000-character cap would need the transcript
  written to a file for the new agent to read, rather than passed inline.
