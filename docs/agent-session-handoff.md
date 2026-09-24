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

## Finding Claude's session file

Claude keeps one JSONL per session under `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<dir>/`.
`resolveClaudeTranscript` in `packages/host-service/src/terminal/harness-transcript.ts` looks for it
in three places, most trustworthy first:

1. **The path Claude reported.** Every Claude hook payload carries `transcript_path`. The notify
   hook (v20+) forwards it, and the host stores it on `terminal_agent_bindings.transcript_path`.
   This depends on nothing about Claude's layout.
2. **The path Claude's naming scheme gives.** Claude Code 2.1.282 names the directory after the
   working directory, resolved through symlinks and NFC-normalized, with every non-alphanumeric
   UTF-16 unit replaced by `-`. Past 200 characters it truncates and appends
   `Math.abs(javaHash(path)).toString(36)`. `claudeProjectDirName` copies this. It is not a
   documented contract.
3. **A search by session id.** Session ids are UUIDs, so `projects/*/<id>.jsonl` is the session
   wherever it was filed. This catches agents started in a subdirectory,
   `CLAUDE_CODE_PROJECT_DIR_NAME`, and future naming changes.

A miss on all three logs `[harness-transcript] no transcript for claude session …`, and a hit on
2 or 3 logs which lookup found it. If the first of those starts appearing in host logs, Claude
has changed its store.

## Trust and staleness

- The hook endpoint is unauthenticated, so a reported path is stored only if
  `isTrustedTranscriptPath` accepts it: absolute, `.jsonl`, and under the user's home.
- It is stored only while the binding still names the reporting session. It is used only when
  its file name is `<bound session id>.jsonl`, so a path left behind by an earlier session in the
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
| Fork preflight (`hasHarnessSession`) | Also uses steps 2 and 3. A session found anywhere is `true`. `false` needs the encoded project directory to exist and lack the file. Otherwise `null` (unknown, fork allowed) |

## Not covered

- Codex, OpenCode, and other agents have no harness reader, so they always hand off from the PTY
  stream.
- Handing over a conversation longer than the 36,000-character cap would need the transcript
  written to a file for the new agent to read, rather than passed inline.
