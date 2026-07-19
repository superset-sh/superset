# Headless CLI control of running agents

This ExecPlan replaces the earlier write-only sidebar-intent proposal. It is a living document; keep `Progress`, `Decision Log`, and `Outcomes` current while implementing it.

## Purpose

The CLI can launch an agent but cannot inspect or continue that agent afterward. Add the smallest useful headless loop:

    superset agents sessions list
    superset agents sessions read <session-id> --lines 120
    superset agents sessions send <session-id> "Now fix the failing test"
    superset agents sessions send <session-id> --file follow-up.md --wait
    superset agents sessions wait <session-id> --for idle --timeout 5m

These commands operate on running terminal agents whether or not the desktop renderer is open. Human output is concise; the CLI's existing global `--json` mode is the stable scripting interface.

This plan intentionally does not add sidebar group CRUD. The previous design added a migration, generic queue, router, event, renderer consumer, and reconciliation rules for write-only UI organization while still offering no way to observe or steer the work. Sidebar organization can return as a separate plan once its state has a canonical readable owner.

## Research summary

The popular tools converge on a small session control surface rather than a generic intent bus:

- Herdr: `agent list/get/read/send/wait/attach/start`; its headless CLI talks to the same local socket as the TUI and reads the PTY-owned terminal stream.
- Agent Herder: `sessions`, `scrollback`, `send`, `resume`, and `fork`; terminal tabs remain the UI, but every important operation is scriptable.
- AWS CLI Agent Orchestrator: `session list/status/send`; `send` can wait or run asynchronously, and existing sessions remain addressable.
- Claude Code agent view: list by state, peek at recent output, reply without attaching, and attach only when full interaction is needed.

References:

- https://herdr.dev/docs/cli-reference/
- https://github.com/generativereality/agentherder
- https://github.com/awslabs/cli-agent-orchestrator
- https://code.claude.com/docs/en/agent-view

The reusable pattern is: stable session identity -> status/list -> recent output -> send follow-up -> wait for a state transition. Superset already has stable `terminalId` values and persisted `terminalAgentBindings`, so v1 should expose them rather than create another durable command queue.

## Scope

### In v1

- Running terminal agents launched through the host service.
- Cross-host listing and exact session-id resolution.
- Normalized states: `working`, `permission`, `idle`, `failed`.
- A recent plain-text terminal snapshot, explicitly not a canonical transcript.
- Safe single-line or multiline follow-up prompts.
- Poll-based wait and `send --wait` for scripts.
- Operation with the desktop app closed.

### Deferred

- Resuming an agent process after its terminal has exited. That needs per-agent native resume adapters using `agentSessionId`; it is different from sending another turn to a live process.
- Superset chat and ACP sessions. Their structured message APIs should eventually implement the same CLI contract, but terminal-agent control should ship without waiting for that unification.
- Attach/focus/TUI commands, task DAGs, inboxes, coordinator loops, and automatic fan-out.
- Sidebar group create/rename/delete/move and `workspaces create --group`.

## Existing foundations

- `packages/host-service/src/trpc/router/agents/agents.ts` launches terminal agents and returns the `terminalId` as `sessionId`.
- `terminalAgentBindings` persists `terminalId`, `workspaceId`, agent identity, native `agentSessionId`, and the last lifecycle event.
- `terminalAgents.list` already returns live, workspace-owned bindings across a host.
- `terminal.writeInput` can write to a live PTY.
- The PTY daemon owns processes independently of renderer sockets and retains a capped ring buffer for replay.
- `packages/host-service/src/events/map-event-type.ts` already normalizes provider hooks to `Start`, `Stop`, `PermissionRequest`, and `Failed`.

The important gap is that the daemon ring buffer is only exposed through replay-on-subscribe, and `terminal.writeInput` is a low-level keystroke API. Headless orchestration needs semantic read/send procedures on the agent binding.

## Reproduced launch gaps

The session-control work must not build on the assumption that `superset agents create` reliably starts an agent. On 2026-07-19, CLI v1.15.1 returned exit 0 and a terminal session id for three multi-kilobyte prompts, but each generated argv command was truncated before its closing quote and terminating newline. PTY replay showed an incomplete command sitting at the shell prompt, and no Codex or Claude child process existed. Canceling the partial line and sending a compact equivalent command plus carriage return started all three agents.

The current launch path builds one quoted interactive command in `packages/host-service/src/trpc/router/agents/agents.ts`, passes it as `initialCommand`, and `queueInitialCommand` in `packages/host-service/src/terminal/terminal.ts` appends a newline before one PTY input write. The CLI treats the returned terminal descriptor as a successful launch. Large prompts therefore need a lossless transport that cannot drop the command tail at a PTY input boundary, plus an acknowledgement/error contract that does not report an idle shell as a launched agent.

There is also a public naming mismatch: CLI v1.15.1 supports `superset agents create`, while `superset agents run` returns `Unknown command: run`. `apps/docs/content/docs/cli/cli-reference.mdx` still uses `agents run` in an orchestration example even though the same page later documents `agents create`. User-facing docs and agent guidance should consistently use `agents create`; the internal host-service tRPC procedure may remain `agents.run`.

## Plan

### 0. Make agent launch lossless and align CLI guidance

Before adding follow-up control, fix `superset agents create` so large, multiline, Unicode, and attachment-expanded prompts reach argv- and stdin-based agents without being truncated. Do not send an unbounded prompt as one synthetic interactive keystroke burst. Prefer the existing prompt-file/stdin machinery or another lossless, shell-compatible transport; preserve fish compatibility, prompt sanitization, quoting, and short-prompt behavior.

Make the success contract meaningful: either confirm that the complete command was durably queued/executed, or return a clear launch error instead of a terminal id that contains only an incomplete shell line. Add regression tests beyond PTY input-buffer boundaries that assert the closing bytes and submit key arrive and that an agent child starts. Cover argv and stdin transports, multiline/Unicode input, and attachment-expanded prompts.

Replace stale public `superset agents run` examples with `superset agents create`, including the orchestration example in the CLI reference. Do not rename the internal `agents.run` tRPC procedure as part of this cleanup.

### 1. Expose a non-destructive PTY snapshot

Add a `snapshot` request/reply to `packages/pty-daemon` and bump its negotiated protocol version. The reply carries the current session ring buffer as the binary payload and does not subscribe, attach, resize, focus, or clear anything.

Expose it through `DaemonClient.snapshot(terminalId)`. Keep the existing 64 KiB cap for v1; this is enough for the current screen and recent context without turning the daemon into transcript storage. Return whether older bytes were evicted so callers can label truncated output honestly.

Add a host-service helper that renders the ANSI snapshot through `@xterm/headless` and returns the last requested logical lines as plain text. Cap `lines` at 1,000. Reads must not mutate terminal state.

Tests: protocol wire shape/version negotiation, non-destructive repeated snapshots, truncation reporting, ANSI screen rendering, unknown terminal, and byte fidelity.

### 2. Add semantic agent-session procedures

Extend `terminalAgents` with:

- `get({ terminalId })`: return one live binding plus normalized status.
- `read({ terminalId, lines })`: resolve the live binding, snapshot its PTY, and return `{ terminalId, workspaceId, status, output, truncated }`.
- `send({ terminalId, prompt })`: resolve the live binding, ensure the daemon session is adopted by this host-service process, sanitize the prompt with `sanitizePromptForPty`, submit it as bracketed paste followed by carriage return, and return `{ accepted: true, sentAt }` using the host clock.

Also add normalized `status` to `terminalAgents.list`. Put the lifecycle-to-status mapper in shared host-service code so the desktop and CLI do not grow divergent interpretations.

Refactor the renderer WebSocket route's existing adopt-on-demand logic into a reusable terminal helper. `read` and `send` must use it so they still work after a host-service restart and while no renderer is attached. Do not respawn an exited process or silently create a new conversation.

Security and correctness:

- Resolve through the live binding, not a caller-provided workspace id.
- Reject bindings whose terminal is no longer active.
- Keep `terminal.writeInput` as the low-level keystroke API; only `terminalAgents.send` accepts semantic prompts.
- Multiline input must be one bracketed-paste payload and one submit key, never a series of shell lines.

Tests: live/stale binding resolution, desktop-closed send, adoption after simulated host restart, multiline prompt encoding, control-character sanitization, read without attaching, and status mapping.

### 3. Add the headless CLI commands

Add `packages/cli/src/commands/agents/sessions/` with `list`, `read`, `send`, and `wait`.

- `list`: fan out across reachable hosts using the same host filtering and warning behavior as `workspaces list`; optional `--host`, `--local`, and `--workspace`. Display status, agent, workspace, host, last event time, and full session id.
- `read <session-id>`: resolve an exact id across reachable hosts and print the recent text snapshot. Support `--lines`; JSON returns the full structured response.
- `send <session-id> [prompt...]`: accept exactly one source from positional text, `--file`, or piped stdin. Support `--wait` and `--timeout`.
- `wait <session-id>`: poll `terminalAgents.get` until `--for working|permission|idle|failed`, exit, disappearance, timeout, or Ctrl+C. No server-side long request is needed.

Create one CLI resolver for read/send/wait. An explicit `--host` or `--local` probes only that host; otherwise it probes reachable hosts in parallel and requires exactly one matching full UUID. Surface unreachable hosts as warnings, matching workspace commands.

For `send --wait`, use the returned host-clock `sentAt` as a cursor: do not accept the session's pre-send idle state. Wait until `lastEventAt >= sentAt` and the session reaches `idle`, `permission`, or `failed`, then return the final status and a fresh read snapshot. This avoids the common race where a fast turn starts and finishes between CLI polls.

Tests: cross-host resolution, duplicate/not-found handling, table and JSON shapes, prompt source exclusivity, stdin/file input, wait transition cursor, timeout, and abort.

## Validation

Run targeted tests first, then repository checks:

    bun test packages/pty-daemon
    bun test packages/host-service/src/trpc/router/terminal-agents
    bun test packages/cli/src/commands/agents
    bun run test:cli-e2e
    bun run typecheck
    bun run lint:fix
    bun run lint

The isolated CLI E2E harness automates the desktop-closed acceptance sequence and records every command, exit code, stdout, stderr, and assertion:

1. Launch an agent with `superset agents create` using a prompt larger than the prior truncation case; verify the full prompt reaches the agent, the command executes, and retain the returned terminal session id.
2. `agents sessions list` shows it with the correct host, workspace, agent, and state.
3. `agents sessions read` returns recent meaningful output without attaching or focusing a terminal.
4. Send a multiline follow-up through stdin; the agent receives it as one prompt.
5. `send --wait` exits on completion, permission, or failure and prints the final recent output.
6. Restart only host-service while leaving the PTY daemon and agent alive; repeat read/send successfully.
7. An exited or unknown session fails clearly and never starts a replacement conversation.

## Decision Log

- Decision: prioritize live-agent control and remove sidebar intents from v1.
  Rationale: orchestration requires observable, addressable work. A write-only UI queue is not a useful control plane and has ambiguous ownership when multiple renderers connect.
  Date: 2026-07-19.
- Decision: use `terminalId` as the v1 control target.
  Rationale: it is already returned by launch, persisted, globally unique, and bound to workspace and native agent session identity.
  Date: 2026-07-19.
- Decision: expose recent PTY state, not transcript storage.
  Rationale: the daemon already owns a bounded buffer. Native structured history and exited-session resume vary by agent and belong in a later adapter layer.
  Date: 2026-07-19.
- Decision: wait by short CLI polling, not a durable inbox or long-lived HTTP request.
  Rationale: lifecycle state is already persisted, polling works across relay connections, and the `sentAt` cursor closes the important race without new infrastructure.
  Date: 2026-07-19.
- Decision: make launch reliability a prerequisite for session control.
  Rationale: list/read/send/wait cannot be dependable when `agents create` can return success for an incomplete, unexecuted shell command. The same regression tests should exercise the transport boundary used by future semantic sends.
  Date: 2026-07-19.
- Decision: pass only a short POSIX-launcher path through interactive PTY input and keep prompt bytes in a mode-0600 file.
  Rationale: this removes prompt size from the terminal line editor boundary for both argv and stdin agents while remaining compatible with fish. The launcher acknowledges a surviving child process, so immediate exec failures do not produce false-success session IDs.
  Date: 2026-07-19.
- Decision: add a protocol-v3 snapshot reply with raw bytes, terminal dimensions, and an eviction flag.
  Rationale: dimensions let host-service render the bounded ANSI state accurately without a second list race, while the eviction flag prevents callers from mistaking a recent snapshot for a complete transcript. The daemon package is bumped to 0.2.6 so installs can detect the changed wire contract.
  Date: 2026-07-19.
- Decision: make cross-process CLI acceptance executable and generated rather than manual evidence.
  Rationale: a desktop-shell screenshot and hand-written summaries cannot prove headless command behavior. The harness must invoke the real CLI, isolated host HTTP service, and Electron-as-Node PTY daemon, then derive its report from captured commands and assertions.
  Date: 2026-07-19.

## Progress

- [x] Lossless large-prompt launch, truthful success/error contract, and `agents create` guidance cleanup
- [x] PTY snapshot protocol and text renderer
- [x] `terminalAgents.get/read/send` and normalized status
- [x] CLI `agents sessions list/read/send/wait`
- [x] SUPER-1568 workspace-create attachments, prompt-size coverage, and partial-failure reporting
- [x] Reproducible CLI E2E, focused tests, typecheck, and lint validation

## Outcomes

- Large prompts now bypass interactive line editing through a secure prompt file and short POSIX launcher. `agents create` waits for a surviving child process and tears down false-success terminals on immediate launch failure.
- Protocol v3 exposes non-destructive, byte-faithful snapshots with exact-tail retention and truncation metadata. Host-service renders the bounded ANSI state into recent logical text lines through headless xterm.
- Live terminal agents are addressable by `terminalId` through normalized list/get/read/send procedures. Reads and sends adopt daemon-owned sessions without a renderer and never respawn a missing process.
- The CLI now exposes cross-host `agents sessions list/read/send/wait`, including positional/file/stdin prompt sources, multiline bracketed paste, polling cancellation/timeouts, and a host-clock cursor for `send --wait`.
- Automated unit, byte-fidelity, daemon integration/handoff, supervisor, production-ABI PTY E2E, monorepo typecheck, and lint validation pass.
- The desktop-closed CLI acceptance sequence passes against an isolated production-ABI PTY daemon and restartable host fixture: an 88,016-byte multiline Unicode argv prompt arrived byte-for-byte, list/read/send/wait covered every normalized lifecycle state, multiline stdin remained one prompt, read/send survived a host-only restart, and exited/unknown sessions failed without replacement. An immediate exec failure returned exit 1 without a false session id.
- The acceptance run exposed that the shared CLI parser rejected the conventional `--file -` spelling even though the session command supported `-` as stdin. The parser now accepts exactly `-` as a string option value, with a regression test; the spelling also passed through the full send/wait path.
- `bun run test:cli-e2e` now recreates the desktop-closed acceptance run from an isolated Git repository, Superset home, manifest, host database, attachment root, host-service process, and production-ABI PTY daemon. It emits machine-readable results, a full command transcript, a rendered report/screenshot, the raw fake-agent byte capture, and the checkpointed database. A retained run is under `plans/evidence/20260719-agent-sessions-e2e/`; product code does not depend on it.
- SUPER-1568 (`cli-gap-attachments-not-supported-in-workspaces-cr`) is covered by the same launch boundary: workspace creation accepts repeatable local paths and pre-uploaded attachment IDs, resolves both forms through the shared CLI helper used by `agents create`, and forwards the complete attachment-expanded prompt through the lossless launcher. There is no CLI or host-schema prompt character cap. If workspace creation succeeds but an inline agent launch fails or is omitted from the host response, the CLI exits with a clear partial-success error containing the retained workspace ID and an `agents create` retry command instead of reporting success.
