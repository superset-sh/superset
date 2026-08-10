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

**AMENDED 2026-08-04 (supersedes the placement below and the paragraph after it):** the runtime ships as a standalone **`packages/chat-runtime`** that owns its own SQLite file (`<dataDir>/chat.db` — never host.db) and exports a mountable surface (`createChatRuntime({ dataDir })` → journal/sessions now; tRPC router + WS handler as they land). Host-service becomes a thin mount. Rationale: owning its own DB removes the host.db schema/migration coupling that justified deferral, the package tests in full isolation, and any future runner (slim sandbox, integration harness) mounts it directly. Directory paths below read `packages/chat-runtime/src/…` accordingly; the import-boundary rule stands (no host-service imports, ever).

**Original rationale (superseded) — why in host-service and not a shared package (the sandbox question):** in our topology a remote/sandboxed workspace runs host-service itself behind the relay, so placing the chat runtime in host-service already centralizes it for every environment that runs harnesses. The scenario that would justify extraction is a future *slimmer* runner (ephemeral per-task sandboxes without host-service's workspace/terminal machinery) — and that runner would need the whole `runtime/chat/` slice (journal + stream + adapters), not just mappers. So the rule is: **`runtime/chat/**` imports only the chat package's protocol schemas, vendor SDKs, and its own files — never host-service's workspace/git/terminal modules.** That keeps `runtime/chat/` → `packages/chat-runtime` a mechanical `git mv` the day a second runtime exists, without paying for a package nobody consumes today.

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

**Unmapped vs ignored (amended 2026-08-05, after both adapters shipped).** The original rule — "anything unmapped becomes a `notice`, never silently dropped" — is too blunt for real harness streams, and Claude and Codex ran into it independently. Split it:

- **Semantic events** — anything a reader would want in the transcript — become `notice`. This is the default, and it is what keeps the vocabulary honest when a harness grows a message type we have never seen.
- **Enumerated telemetry** is ignored: hook lifecycle, MCP server startup chatter, account and rate-limit updates, and derived aggregates that duplicate items we already emit (codex's `turn/diff/updated`). Left as notices these flood a single turn with rows nobody reads.

The rule that makes the second bucket safe is that **the ignore list is enumerated and named in code** (a per-adapter `IGNORED_*` constant), so each exclusion is a reviewable decision rather than a silent `default:` fallthrough — and anything not on the list still surfaces as a notice.

## 3. The mapping (SDKMessage → protocol)

SDK options: `includePartialMessages: true` (for deltas), `--forward-subagent-text` (or subagent prose never arrives), `canUseTool` wired to approvals.

| SDK signal | Protocol emission |
|---|---|
| `system/init` (model, `capabilities`) | `session` update (`harness: "claude-code"`, `modelId`). **Recorded:** `capabilities` is `null` on 2.1.222 — there is nothing to feature-detect from, so the adapter leans on open-union tolerance instead |
| `prompt()` accepted | `user_message` item (host-minted, echoes `clientId`); `turn` running |
| `stream_event` text deltas | `delta {type:"text"}`, coalesced host-side |
| assistant message settled | `agent_message` full snapshot (authoritative over deltas) |
| thinking blocks | `reasoning` item (deltas → same `text` channel). **Recorded:** thinking and text settle as *separate* messages sharing one `message.id`, so item ids are `${messageId}#${index}` and ordering follows arrival, not block index. `signature_delta` carries no renderable text and is ignored |
| `tool_use` block | `tool_call` snapshot, `status: "running"`; `toolKind`/`title` from the ported map (Read→`read`, Edit→`edit` + diff content, **Write→`edit` with `oldText: null`**, Bash→`execute` + terminal content, Grep/Glob→`search`, WebFetch/WebSearch→`fetch`, Task→`other`); paths display-relativized only when inside cwd. **Recorded:** the subagent tool is named **`Agent`** on 2.1.222 — map both `Agent` and `Task` or subagent calls fall through to the default |
| `canUseTool` callback | `approval_request` item (`targetItemId` = the tool_call, `title` from `options.title`); SDK promise resolves on `respondToApproval`; `decline`→deny (turn continues), `cancel`→deny + `cancelTurn()`; unresolved-at-provider-loss → snapshot re-emitted `status: "stale"`. **Two recorded traps, both silent:** `allowedTools` **shadows** `canUseTool` — a tool on that list is auto-approved and the callback never fires, so the adapter must refuse to set both; and an `accept` **must echo `updatedInput`** back or the tool call dies with a ZodError |
| `tool_use_result` | `tool_call` snapshot with `status`, `rawOutput` from the **full Output object** on the snake_case `tool_use_result` (never the model-facing string — that one carries our own agentId/usage trailer for Task tools), content updated (terminal output snapshot, `truncated` set by our own caps). **Recorded:** bash results carry no `exitCode`, so `ToolContent.terminal.exitCode` stays absent for Claude |
| messages with `parent_tool_use_id` | same items with `parentItemId` = the subagent (`Agent`/`Task`) tool_call id (flat list; nesting is render-side) |
| `SDKToolUseSummaryMessage` | v1: dropped (projection-layer collapsing covers it); revisit as a group-title source |
| `background_tasks_changed` | level-replace of an internal running-set; surfaces only via `session.status` (no per-task items in v1) |
| compaction events | `notice {noticeKind: "compaction"}` |
| `result` (success/error, usage, cost) | `turn` completed/failed + `Usage` (cached tokens kept distinct) |
| abort / `TerminalReason` | `turn` interrupted; `aborted_streaming` vs `aborted_tools` recorded in `turn.error.message`. **Recorded:** an abort arrives as a **thrown iterator error**, not as a terminal `result` message — the interrupted turn and its canceled tool_calls are synthesized in the `catch`, which is the only place invariant 5b can be honoured |
| anything unmapped | `notice {noticeKind: "info"}` for semantic events; enumerated telemetry is ignored — see §2's unmapped-vs-ignored rule |

**Approvals have no wire representation.** `canUseTool` is a callback the SDK invokes in-process; nothing about it appears in a recorded message stream. Approval behaviour therefore *cannot* be covered by fixtures — only the live smoke test exercises it, and the two traps above (shadowing, `updatedInput`) are exactly the kind that fixtures would have missed. Budget for that asymmetry: for Claude the fixture suite is a regression net for *mapping*, and the live test is the only net for *approvals*.

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

What fixtures cannot cover, per harness, is worth stating up front because it decides where the live smoke earns its keep. For **Claude**, approvals are an in-process `canUseTool` callback with no wire representation at all — no recording can contain one, so the live test is the *only* coverage for the approval path (§3). For **Codex** the opposite holds: approvals are ordinary server-initiated JSON-RPC requests, so a recording captures the full round trip including our response, and the fixture replays it through a transport-level player. Recording is also the only way to learn the wire truth in §6a — the generated bindings disagreed with it twice.

## 6. Sequencing — dual-harness launch (Claude + Codex)

Decision: ship Claude and Codex adapters together. The runtime is 100% shared, the Codex mapping is near-1:1 (our mechanics are copied from its app-server protocol), and N=2 at launch is the forcing function that keeps the vocabulary harness-neutral instead of accreting Claude-isms. That bet paid off: both adapters independently hit the unmapped-vs-ignored problem in §2, which a single-harness launch would have shipped as a Claude-ism. It was also optimistic in places — `commandActions` turned out to supply `toolKind`/`title` only sometimes, and approvals do not map field-for-field. See §6a.

1. `harness/types.ts` + journal + projection (no adapter yet; a scripted fake harness drives it).
2. Claude adapter against fixtures; port the tools.ts mapping table with its test cases. Claude goes first by a few days to drive out runtime rough edges.
3. **Codex adapter in parallel** once the interface + fixture pattern settle: `harness/codex/` speaking **app-server JSON-RPC over stdio** (NOT `@openai/codex-sdk` / exec-JSON — that path drops tool arguments and diff text, openai/codex#5028). Thread/Turn/Item → our items; approvals carry a harness-supplied decision set (§6a); `Plan` → `plan`.
4. Stream endpoint + reset/replay semantics against the journal.
5. tRPC commands with `commandId` dedupe.
6. Minimal desktop pane behind the internal-build flag, harness picker included from day one.

Version-skew policy (the real Codex cost): users bring their own `codex` binary and the app-server interface is officially experimental. The Codex adapter therefore: enforces a minimum supported version at `initialize` (clean "upgrade codex" error, never a mangled transcript), and keeps fixtures recorded against both the pinned minimum and current. Claude is insulated by exact-pinning `@anthropic-ai/claude-agent-sdk` (0.3.x moves fast; upgrade deliberately with the fixture suite as the regression gate).

### 6a. Codex wire truth (recorded 2026-08-05 against codex-cli 0.143.0)

Everything below comes from recorded `codex app-server` frames (`packages/chat-runtime/src/harness/codex/fixtures/*.jsonl`), not from the generated `app-server generate-ts` bindings. **Where the two disagree, the recording wins** — the bindings were wrong or incomplete in two places that matter.

**Feature detection is not available, so the version gate carries the whole load.** `initialize` returns `{userAgent, codexHome, platformFamily, platformOs}` and nothing more; the `capabilities` object in that handshake is *client*-declared (`experimentalApi`, `requestAttestation`), not a server reply. The instruction above to "feature-detect from the handshake, never version-string compare" is therefore not implementable as written, and the adapter does the only two things on offer: enforce a minimum version, and tolerate whatever it does not recognise (unknown notifications and unknown item types become `notice`s). Read the rule as *never version-compare **for features***; the compatibility gate itself has no choice but to be a version compare.

**That version only exists inside `userAgent`, prefixed by our own client name** — `superset-chat-runtime/0.143.0 (Mac OS 26.5.0; arm64) …`, where the number after the first slash is codex's. A fragile parse on a string we partly control. `thread.cliVersion` on the `thread/start` response is the cross-check.

**`MIN_CODEX_VERSION` is evidence-bound, not conservative.** It sits at 0.143.0 because that is the only version anyone has verified; it will reject users on slightly older binaries. Lower it as older versions are actually tested — do not lower it by assumption.

**Server frames omit `jsonrpc` entirely.** Requests we send carry it; responses and notifications coming back do not. A strict JSON-RPC 2.0 reader rejects the entire stream.

**Approvals: `availableDecisions` drives the options — never hardcode a decision set.** The field is on the wire and absent from the generated bindings. The recorded exec approval offered `accept`, `acceptWithExecpolicyAmendment` and `cancel` — and **no `decline`**. It maps straight onto `ApprovalRequest.options`, with the raw value returned via `Decision.option`. A fixed accept/decline/cancel button row would offer users decisions codex rejects.

**`commandActions` is a hint, not the pre-parsed title §6 assumed.** `read`, `search` and `listFiles` arrive parsed with name/query/path; an ordinary `echo` or `touch` yields `{"type":"unknown"}`, so the adapter still synthesizes `title` and `toolKind` for the common case. Relatedly the item's `command` is the full `/bin/zsh -lc '…'` wrapper — `commandActions[].command` is the one to display.

**`fileChange` diffs come in two different formats.** `add` gives the raw new file content with no `+` prefixes; `update` gives a headerless hunk diff (`@@ -1,3 +1,3 @@`, no `---`/`+++`). Our `ToolContent.diff` wants `oldText`/`newText`, so the adapter reconstructs both sides — and for `update` that reconstruction is **hunk-local, not whole-file**. Renderers must not assume the two strings are complete file contents.

**Timestamp units are mixed:** `Turn.startedAt`/`completedAt` are seconds, item `startedAtMs`/`completedAtMs` are milliseconds.

**There is no per-thread mode setter.** `collaborationMode` (`plan` | `default`) is readable in `ThreadSettings` and settable only as a TUI startup flag; no client request writes it. So `setMode` maps to the sandbox/approval pairing applied to each `turn/start` — `read-only`, `auto`, `full-access`. For codex, `SessionState.modeId` is a permission level, not plan-vs-default, and the picker should say so.

**Interrupt leaves items dangling; the adapter closes them.** `turn/completed{interrupted}` arrives with no `item/completed` for the in-flight message. The adapter settles them itself: accumulated delta text plus `completedAtMs`, and running tool_calls to `canceled`. That is invariant 5b enforced at the adapter rather than only at resurrection — and it is why the adapter accumulates delta text it would otherwise not need.

**The `turn/start` response races its own notifications.** Its promise can resolve *after* `turn/completed`, which would regress a settled turn back to `running`. The adapter suppresses running-after-terminal. Any adapter that emits turn state from both a request response and a notification stream needs the same guard.

**Known weak mapping: `item/plan/delta`.** It is routed to the `text` delta channel targeting a `plan` item, which has no `text` field for a client to append to. Flagged rather than solved; dropping it may be the more honest answer once someone sees a real streamed plan.
