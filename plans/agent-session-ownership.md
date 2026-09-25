# Terminal agent session ownership

Status: proposed follow-up to [PR #7263](https://github.com/superset-sh/superset/pull/7263).
This document does not introduce a new protocol or database migration.

## Problem

A terminal ID identifies where a hook should be delivered. It does not prove that
the reporting process owns that terminal's top-level agent session. A child CLI
inherits the terminal's environment, and may report a different provider or native
session ID. The current host can then replace the parent binding or mark the
parent finished. That binding also selects the executable and conversation used
for automatic resume.

PR #7263 separates the wrapper's agent identity from the hook configuration's
harness, drops foreign-harness events, and supplies OpenCode's native session ID.
It reproduces and fixes Cursor replaying Claude hooks and subsequently resuming
with Claude. It does not establish ownership of a particular agent process.

Remaining examples:

- Claude launches a standalone Claude child. Both have harness `claude`, but the
  child's ordinary hook can carry its own conversation ID without a native
  subagent marker. Harness comparison cannot distinguish them.
- A delayed hook from a completed launch arrives after another agent starts in
  the same shell. Terminal identity is unchanged, but launch identity changed.
- An unwrapped binary emits hooks without the launch metadata supplied by a
  managed wrapper.

Native subagents that carry explicit subagent identity already have a separate
roster path. Preserve that behavior rather than treating every child as a new
terminal agent.

## Invariants

1. Only the current, verified top-level launch can replace the terminal binding's
   provider, native session ID, definition, or lifecycle state.
2. Stop means the turn completed. It does not release ownership of the live agent
   or its resumable conversation.
3. A nested child's completion cannot finish its parent or replace its resume ID.
4. A legitimate new top-level agent in the same shell can acquire ownership after
   the previous owner exits. Do not make terminal identity permanently immutable.
5. A late event from a previous launch cannot resurrect or end the current one.
6. Validation happens before persistence, lifecycle broadcasts, notifications, or
   other event-driven effects. Dropping only the store write is insufficient.
7. Host-service restart must preserve ownership of surviving PTYs and agents.

## Proposed model

Keep these concepts separate:

| Field | Meaning |
| --- | --- |
| Terminal ID | PTY destination; may outlive multiple agent launches |
| Launch generation | Host-issued identifier for one accepted top-level launch |
| Process identity | Runtime/host, PID, process start identity, and PTY association |
| Provider / harness | Which CLI owns the native conversation and emits the hook |
| Native session ID | Provider-specific conversation to resume |
| Parent launch / subagent ID | Explicit relationship for child activity |

Persist the accepted launch generation and process identity alongside the binding
in the host's local database. Do not put entity-scoped ownership in renderer
localStorage. Account/definition identity remains separate from the provider and
is retained for command construction. Any schema change needs a generated local
migration in the implementation PR.

A launch generation inherited through the environment is correlation data, not
proof. Children inherit it too. The host must corroborate the reporting process
against the accepted owner, including ancestry and process-start identity to avoid
PID reuse. A PID supplied by an HTTP caller is also only a claim.

## Acceptance flow

1. A wrapper requests launch registration before replacing itself with the CLI.
   The host associates it with the real PTY and captures process-start identity.
   Use the PTY daemon's process relationship as primary evidence. The wrapper's
   PID surviving `exec` helps correlate the later CLI, but executable validation
   must account for interpreter/shim launchers.
2. If the existing owner is alive and the new launch descends from it, classify
   the launch as nested. Keep the parent binding. A native child can join the
   roster; an unsupported standalone child cannot mutate terminal lifecycle.
3. If the former owner exited and the shell starts another CLI, register a new
   generation. Ordinary progress hooks cannot perform this replacement.
4. For each hook, resolve its reporting process through known transient hook
   shells to its owning agent. Require the accepted generation, provider, and
   process relationship before changing the binding or emitting lifecycle events.
5. A native session ID may be learned after launch. Once bound, a different ID
   requires an adapter-recognized conversation switch from the verified owner.
   Changing conversations inside OpenCode or clearing a Claude conversation must
   remain supported without granting a nested CLI the same authority.
6. SessionEnd releases ownership only when it belongs to the accepted launch.
   Terminal loss preserves the validated provider/session pair for resume. A new
   terminal created by resume receives a new launch generation and an explicit
   link to its predecessor.

Implement a pure acceptance decision shared by the host's hook route and binding
store. Execute that decision in a per-terminal transaction or compare-and-swap:
validate the expected generation and process identity against current state, then
commit the generation, process identity, ownership, and binding together. Retry
or reject a decision if its expected state changed. Return a classification such
as accepted, nested, stale, or unverified; rejected events have no lifecycle side
effects. Broadcast lifecycle changes and notifications only after the accepted
commit, preserving per-terminal commit order. Validation followed by an unrelated
store write is insufficient. Keep classification independent of UI.

## Compatibility and recovery

- Introduce optional wire metadata first and deploy updated wrappers/adapters
  before enforcing it. Version provisioning so existing installations update.
- For legacy/unwrapped launches, attempt host-side process reconciliation. If
  ownership cannot be proven, preserve an existing validated resume binding.
  Do not silently replace it based on the latest arriving hook.
- Preserve OpenCode's legacy `permission.ask` fallback: when the callback omits
  `permission.sessionID`, use the verified tracked `rootSessionID` for that owner.
  If both identifiers are absent, classify the event as unverified and leave
  ownership and permission state unchanged. This fallback does not bypass the
  reporting process and launch-generation checks.
- Decide separately how to display an unverified first launch; uncertainty must
  not manufacture an automatically executable resume binding.
- Surviving agents retain immutable environment variables across host restarts.
  Reload accepted generations from host storage and reconcile them with daemon
  state; do not invalidate every launch just because the receiver restarted.
- Remote evidence must be gathered on the execution host, never from desktop-local
  PIDs. Include the runtime/host identity and avoid comparing PIDs across hosts.
- Keep bounded diagnostics for rejected events and their reason. Exclude prompts,
  credentials, and complete process environments. Rate-limit repeated failures.
- This protects against accidental attribution errors among cooperating local
  processes. It is not a security boundary against arbitrary hostile code running
  as the same OS user; stronger authentication is a separate design question.

## Implementation boundaries

Primary sites are `packages/host-service/src/trpc/router/notifications/notifications.ts`
(accept before broadcasting), `packages/host-service/src/terminal-agents/store.ts`
(binding and roster decisions), terminal/daemon process tracking, agent launch and
resume paths, and `packages/agent-setup` wrappers and adapters.

Before adding environment variables, follow `docs/environment-variables.md`.
Process probes must be bounded and cached for the lifetime of a process identity;
do not run an unbounded process-tree scan on every tool hook.

Keep the missing built-in-agent configuration fallback separate: detection may
work while resume is unsupported because no host configuration exists. Ownership
validation must not silently invent account settings or user command arguments.

## Verification matrix

| Scenario | Required result |
| --- | --- |
| Cursor replays Claude hooks | Cursor identity and native session remain intact |
| Claude launches Codex/OpenCode | Parent remains Claude; child cannot finish it |
| Same-harness standalone child | Child session ID cannot replace parent's ID |
| Native subagent start/stop | Roster updates; parent identity/lifecycle preserved |
| Agent exits, user starts another in same shell | New launch becomes owner |
| Delayed Stop/SessionEnd from old launch | No effect on current owner |
| Concurrent replacement and old-owner hook | Atomic validation/commit rejects stale ownership; effects follow commit order |
| OpenCode legacy permission without a session ID | Verified tracked root supplies the ID; absent root leaves ownership and permission state unchanged |
| Same process starts a new native conversation | Verified adapter transition updates ID |
| Missing wrapper / transient hook shell | Correct process reconciliation or explicit uncertainty |
| PID reused / host-service restarted | No false match; surviving owners remain valid |
| Remote host / multiple organizations | Ownership stays within execution host and terminal |
| Kill terminal and remount | Correct CLI resumes the exact verified conversation |
| Missing config / missing transcript | Explicit unsupported or recovery result |

Use deterministic store tests with delayed/reordered event sequences, real script
integration tests, and before/after CDP journeys on the actual app. Verify provider,
root session ID, lifecycle state, and successful resume independently. A correct
icon or Start/Stop sequence alone does not establish resumability.

## Reference implementations

These are implementation ideas, not proof that another application handles every
case above:

- [Orca's identity resolver](https://github.com/stablyai/orca/blob/61c7b51c8cc9e992dbdebc037562c208f84ac8cd/src/shared/agent-status-identity.ts)
  retains a fresh active parent's provider against foreign hooks. Its state/time
  heuristic does not establish same-harness session ownership.
- [cmux process binding](https://github.com/manaflow-ai/cmux/blob/main/CLI/CMUXCLI%2BAgentHookProcessBinding.swift)
  prefers live process/TTY evidence and can reject an ambient claim after a failed
  live probe.
- [ccmux's marker linker](https://github.com/epilande/ccmux/blob/main/src/daemon/adapters/link.ts)
  re-evaluates native-session ownership and repairs incorrect links using pane/PID
  evidence, with a process-start check when available.
