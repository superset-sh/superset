# Harness Adapters (Claude + Codex) — Chat Protocol v1

**Status:** draft for review. Companion to `plans/chat-protocol-v1.md` (implements §10 for Claude Code) and `plans/chat-ui-greenfield-research.md`.

## 1. The input decision: Agent SDK direct, not ACP

Two ways to drive Claude Code from the host:

| | via ACP (`claude-code-acp` bridge) | via `@anthropic-ai/claude-agent-sdk` |
|---|---|---|
| Fidelity | Flattened to ACP v1's vocabulary | Full `SDKMessage` union: `tool_use_result` (real output objects), `canUseTool` with `options.title`, tool-use summaries, `background_tasks_changed`, `parent_tool_use_id` nesting, 18-value terminal reasons |
| Process model | Extra subprocess speaking JSON-RPC over stdio | SDK manages the Claude Code process itself; we consume a typed stream in-process |
| Known races | v1 create/update tool-call race handled inside Zed's adapter, on Zed's release cadence | No wire protocol between us and the harness — races are ours to not write |
| Auth | Host's `~/.claude` OAuth either way | Same |

**Decision: SDK direct.** Since our canonical vocabulary is our own, the harness input format is a per-adapter choice — and for Claude the SDK is strictly richer than what survives the ACP bridge. The old stack's "ACP won over direct SDK" decision (`plans/done/20260710-session-harness-acp.md`) chose a *canonical wire format* for the old architecture; it does not bind the greenfield adapter's *input*. ACP still matters as the input for a future **generic ACP adapter** (Gemini CLI is natively ACP), which becomes a sibling under the same interface — that's the payoff of the adapter seam.

`zed-industries/claude-code-acp/src/tools.ts` is used as a **reference mapping table** (it encodes every learned edge case of tool_use → renderable-call translation); we port its logic, we do not depend on the package.

## 2. Placement

Host-side code stays out of the chat package (protocol doc §10 hard rule). New runtime directory in host-service, sibling to the existing stacks, sharing nothing with them:

```
packages/host-service/src/runtime/chat/
  journal/            # append-only journal (host.db): (session, epoch, seq, ts, event_json)
                      # + read-model projection written in the SAME transaction
  stream/             # WS /chat-sessions/:id/stream — replay-from-cursor, live fan-out,
                      # per-client delta-channel filtering, reset frames, backpressure
  sessions/           # lifecycle: create/resume/idle-unload, commandId dedupe,
                      # session registry rows (superset sessionId ⇄ claude sessionId — two columns, never conflated)
  harness/
    types.ts          # HarnessAdapter interface (harness-agnostic)
    claude/           # this adapter
      claude-adapter.ts
      map-tool-use/   # the ported tools.ts table: tool name → toolKind/title/content
      fixtures/       # recorded SDKMessage streams (golden transcripts)
packages/host-service/src/trpc/router/chat-sessions/   # §7 commands, mounted beside existing routers
```

The chat package's `src/protocol/` zod schemas are imported by all of the above; every adapter emission is **parsed** on the way into the journal, so a malformed adapter output fails loudly at the boundary, not in a renderer.

**Why in host-service and not a shared package (the sandbox question):** in our topology a remote/sandboxed workspace runs host-service itself behind the relay, so placing the chat runtime in host-service already centralizes it for every environment that runs harnesses. The scenario that would justify extraction is a future *slimmer* runner (ephemeral per-task sandboxes without host-service's workspace/terminal machinery) — and that runner would need the whole `runtime/chat/` slice (journal + stream + adapters), not just mappers. So the rule is: **`runtime/chat/**` imports only the chat package's protocol schemas, vendor SDKs, and its own files — never host-service's workspace/git/terminal modules.** That keeps `runtime/chat/` → `packages/chat-runtime` a mechanical `git mv` the day a second runtime exists, without paying for a package nobody consumes today.

The adapter interface keeps adapters dumb about infrastructure:

```ts
interface HarnessAdapter {
  start(opts: { cwd; modeId?; modelId?; resume?: { harnessSessionId } }): AsyncIterable<AdapterEvent>;
  prompt(content: UserContent[]): void;
  cancelTurn(): void;
  respondToApproval(approvalId: string, decision: Decision): void;
  setMode(modeId: string): void;
  dispose(): Promise<void>;
}
// AdapterEvent = { kind: "item"; item: Item } | { kind: "delta"; delta: Delta }
//              | { kind: "turn"; turn: Turn } | { kind: "session"; session: Partial<SessionState> }
```

Adapters emit protocol shapes and nothing else — no cursors (journal assigns them), no persistence, no sockets. That is what makes them testable as pure `SDKMessage[] → AdapterEvent[]` functions.

## 3. The mapping (SDKMessage → protocol)

SDK options: `includePartialMessages: true` (for deltas), `--forward-subagent-text` (or subagent prose never arrives), `canUseTool` wired to approvals.

| SDK signal | Protocol emission |
|---|---|
| `system/init` (model, `capabilities[]`) | `session` update (`harness: "claude-code"`, `modelId`); capabilities stored for feature detection — never version-string compares |
| `prompt()` accepted | `user_message` item (host-minted, echoes `clientId`); `turn` running |
| `stream_event` text deltas | `delta {type:"text"}`, coalesced host-side |
| assistant message settled | `agent_message` full snapshot (authoritative over deltas) |
| thinking blocks | `reasoning` item (deltas → same `text` channel) |
| `tool_use` block | `tool_call` snapshot, `status: "running"`; `toolKind`/`title` from the ported map (Read→`read`, Edit→`edit` + diff content, **Write→`edit` with `oldText: null`**, Bash→`execute` + terminal content, Grep/Glob→`search`, WebFetch/WebSearch→`fetch`, Task→`other`); paths display-relativized only when inside cwd |
| `canUseTool` callback | `approval_request` item (`targetItemId` = the tool_call, `title` from `options.title`); SDK promise resolves on `respondToApproval`; `decline`→deny (turn continues), `cancel`→deny + `cancelTurn()`; unresolved-at-provider-loss → snapshot re-emitted `status: "stale"` |
| `tool_use_result` | `tool_call` snapshot with `status`, `rawOutput` from the **full Output object** (never the model-facing string — that one carries our own agentId/usage trailer for Task tools), content updated (terminal output snapshot, `truncated` set by our own caps) |
| messages with `parent_tool_use_id` | same items with `parentItemId` = the Task tool_call id (flat list; nesting is render-side) |
| `SDKToolUseSummaryMessage` | v1: dropped (projection-layer collapsing covers it); revisit as a group-title source |
| `background_tasks_changed` | level-replace of an internal running-set; surfaces only via `session.status` (no per-task items in v1) |
| compaction events | `notice {noticeKind: "compaction"}` |
| `result` (success/error, usage, cost) | `turn` completed/failed + `Usage` (cached tokens kept distinct) |
| abort / `TerminalReason` | `turn` interrupted; `aborted_streaming` vs `aborted_tools` recorded in `turn.error.message` |
| anything unmapped | `notice {noticeKind: "info"}` — never silently dropped |

Slash commands, mentions: the composer sends `TextElement` chips; the adapter expands them into the prompt string using the existing host-side slash-command registry (reused over RPC as today — it is already the only workable design since discovery walks the host filesystem).

## 4. Lifecycle & resume

- **Create**: mint superset `sessionId` + journal epoch; `start()` the SDK; store the harness session id when `system/init` reports it.
- **Resume (warm)**: journal is the transcript source of truth — clients replay it; the SDK resumes Claude's own context from its native JSONL via `resume`. The two stores never cross: ours renders, Claude's prompts.
- **Resume (cold/crashed)**: new epoch is minted only if the journal was lost; otherwise epoch survives host restarts (epoch ≠ process lifetime — it is journal identity). Pending approvals found at resume are re-emitted `stale`.
- **Idle unload**: after inactivity, dispose the SDK process, set `session.status: "not_loaded"`; journal remains serveable (a cold session still renders instantly).
- **Interrupt**: `cancelTurn` → SDK abort → `turn.status: "interrupted"`; running tool_calls snapshot to `canceled`.

## 4b. Two stores, and cross-harness continuation

Conversion to protocol items happens immediately at the adapter boundary; the journal only ever contains our format (harness-native payloads survive solely inside `rawInput`/`rawOutput` on items). But the journal is the *rendering* truth, not the *model's memory*: each harness keeps its own native context store (Claude Code JSONL, Codex rollouts), keyed by `harness_session_id`, and same-harness resume always goes through it. We never reconstruct a model's context from our journal.

Cross-harness continuation ("take this Claude session forward with Codex") is therefore a **fork-with-seed**, never a resume: project the journal into a handoff (rendered transcript or summary) that opens a new session on the target harness, linked via `forkedFromSessionId`. Honest, lossy by design (no harness can read another's native store), and enabled precisely because the journal is harness-neutral. Not in v1 scope; the journal projection API is the only prerequisite, so it stays cheap to add.

## 5. Testing

Golden transcripts: record real `SDKMessage` streams into `fixtures/` (bash run, edit with approval, decline, subagent task, compaction, abort mid-tool), then assert `adapter(fixture) → AdapterEvent[]` snapshots and — through the shared reducer — final folded timelines. This covers adapter, journal ordering, and reducer with zero UI and zero live Claude. One live smoke per PR touching the adapter.

## 6. Sequencing — dual-harness launch (Claude + Codex)

Decision: ship Claude and Codex adapters together. The runtime is 100% shared, the Codex mapping is near-1:1 (our mechanics are copied from its app-server protocol, and `commandActions` supplies `toolKind`/`title` pre-parsed), and N=2 at launch is the forcing function that keeps the vocabulary harness-neutral instead of accreting Claude-isms.

1. `harness/types.ts` + journal + projection (no adapter yet; a scripted fake harness drives it).
2. Claude adapter against fixtures; port the tools.ts mapping table with its test cases. Claude goes first by a few days to drive out runtime rough edges.
3. **Codex adapter in parallel** once the interface + fixture pattern settle: `harness/codex/` speaking **app-server JSON-RPC over stdio** (NOT `@openai/codex-sdk` / exec-JSON — that path drops tool arguments and diff text, openai/codex#5028). Thread/Turn/Item → our items; approvals map field-for-field; `Plan` → `plan`.
4. Stream endpoint + reset/replay semantics against the journal.
5. tRPC commands with `commandId` dedupe.
6. Minimal desktop pane behind the internal-build flag, harness picker included from day one.

Version-skew policy (the real Codex cost): users bring their own `codex` binary and the app-server interface is officially experimental. The Codex adapter therefore: enforces a minimum supported version at `initialize` (clean "upgrade codex" error, never a mangled transcript), feature-detects from the handshake (never version-string compares), and keeps fixtures recorded against both the pinned minimum and current. Claude is insulated by exact-pinning `@anthropic-ai/claude-agent-sdk` (0.3.x moves fast; upgrade deliberately with the fixture suite as the regression gate).
