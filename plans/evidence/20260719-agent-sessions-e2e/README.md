# Agent sessions E2E evidence

This bundle preserves evidence from the desktop-closed acceptance run for `plans/20260717-1616-cli-sidebar-groups.md` on 2026-07-19.

## Environment

- Branch CLI invoked from source through `cli-framework dev`.
- Host service ran as a restartable isolated Bun fixture against its own SQLite database.
- PTY daemon v0.2.6 ran under Electron-as-Node, exercising the production native ABI and real `node-pty` process boundary.
- The desktop renderer stayed closed. No normal Superset host database or existing session was used.
- A deterministic hooked agent recorded the exact prompt bytes it received and emitted real lifecycle HTTP hooks.
- The branch desktop app was launched with `RENDERER_REMOTE_DEBUG_PORT=9222`; CDP asserted its authenticated renderer state and captured the visible workspace shell.

## Evidence map

| Claim | Evidence |
| --- | --- |
| Large launch was lossless | `assertions.json` → `largePrompt`; raw record 0 in `raw/capture.jsonl` |
| Multiline stdin was one semantic prompt | `assertions.json` → `multilineSend`; raw record 2 |
| `working`, `permission`, `idle`, and `failed` were observed | `assertions.json` → `lifecycleStates` |
| Read/send survived a host-only restart | `assertions.json` → `hostRestart`; raw records 7 and 8 plus the persisted binding in `raw/host.db` |
| Exited/unknown targets did not create replacements | `assertions.json` → `missingSessions`; the exited fixture binding is absent from `raw/host.db` |
| Immediate exec failure did not report success | `assertions.json` → `launchFailure`; the disposed terminal row is retained in `raw/host.db` with no binding |
| Conventional `--file -` works | `assertions.json` → `stdinSentinel`; raw record 11 |
| Attachment-expanded prompts exceed the old boundary losslessly | `checks.txt` → production-ABI PTY E2E; `packages/host-service/src/terminal/terminal.adoption.node-test.ts` |
| Both CLI attachment forms share one ordered resolver | `checks.txt` → focused attachment tests; `packages/cli/src/lib/upload-attachments.test.ts` |
| Inline workspace agent failures are not silent | `checks.txt` → workspace result-contract tests; `packages/cli/src/commands/workspaces/create/agent-results.test.ts` |
| Desktop renderer remains healthy under the branch build | `cdp-assertions.json` and `cdp-desktop-workspace.png` |
| Automated checks pass | `checks.txt` |

`raw/capture.jsonl` contains only deterministic fake-agent prompts. `raw/host.db` is the isolated fixture database; it contains no production data or credentials.

The CDP run observed external Electric shape requests failing with network-loss/CORS errors. `cdp-assertions.json` records that limitation explicitly; its passing assertions cover the local Electron renderer boot, authenticated workspace route, mounted shell landmarks, visible empty state, and absence of a blocking dialog.

## Recheck commands

```bash
shasum -a 256 plans/evidence/20260719-agent-sessions-e2e/raw/capture.jsonl \
  plans/evidence/20260719-agent-sessions-e2e/raw/host.db

sqlite3 -json plans/evidence/20260719-agent-sessions-e2e/raw/host.db \
  'select id, status, created_at, ended_at from terminal_sessions order by created_at;'

sqlite3 -json plans/evidence/20260719-agent-sessions-e2e/raw/host.db \
  'select terminal_id, last_event_type, last_event_at from terminal_agent_bindings order by started_at;'

bun test packages/cli-framework/src/parser.test.ts \
  packages/cli/src/commands/agents \
  packages/cli/src/commands/workspaces/create \
  packages/cli/src/lib/upload-attachments.test.ts \
  packages/host-service/src/trpc/router/terminal-agents

bun run --cwd packages/host-service test:e2e
```

The source fixture definitions are `packages/cli/test/fixtures/fake-terminal-agent.mjs` and `packages/host-service/test/fixtures/agent-sessions-cli-host.ts`.
