# Claude Code sessions over ACP: a parallel harness beside mastra (host + mobile)

> **Status: completed experiment / retrospective; not selected in this worktree.** This ACP adapter path proved the relay, sequence journal, multi-client, permission, and mobile topology. The active implementation direction is now [direct Claude Agent SDK](./session-harness-claude-agent-sdk.md); ACP-specific runtime, protocol, naming, and elicitation translation are intentionally not carried forward.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` and the ExecPlan template in `.agents/`.

## Purpose / Big Picture

Today every AI chat session in Superset is executed by `mastracode` (the "mastra harness"), and mastra is **live in production on desktop** — so it must not be disturbed. This plan adds a second, completely parallel session runtime to the host-service that runs **Claude Code sessions through the Agent Client Protocol (ACP)**, and gives mobile a first-class live surface for it. Nothing in the existing mastra chat path (`chat` router, `ChatRuntimeManager`, desktop chat UI) is modified. The hard swap that retires mastra is a separate future plan.

After this change:

- The **host-service owns Claude session OS processes**: for each session it spawns the official ACP adapter for Claude — `@agentclientprotocol/claude-agent-acp` (which internally runs the Claude Agent SDK and the Claude Code subprocess) — and speaks ACP JSON-RPC to it over stdio.
- The wire contract for clients is **ACP itself** — the entire type surface comes from `@agentclientprotocol/sdk`; we author almost no protocol types (the sdk's generated zod schemas turned out not to be exported — see D14-b — so runtime validation of our own API inputs uses our own small zod schemas). Our additions are a thin sequence-numbered envelope for the update stream, a small session-scoped state object, and the multi-client rules.
- Any number of clients can attach to a session at any time — through host tRPC for request/response operations and a **WebSocket update stream** (relay-compatible today, zero relay changes) for real-time ACP `session/update` frames. Any attached client can drive the session: prompt, answer permission requests, cancel.
- Clients consume sessions through **React hooks** shipped from the protocol package (`useAcpSession` and friends) — RN-safe, modeled on the ecosystem's `use-acp` hook API, but current-protocol and envelope-aware.
- Only **live** sessions exist as far as the API is concerned: processes are kept alive indefinitely (no idle disposal), and if a session's process dies (crash, host-service restart) the session simply stops being listed. No resume, no transcript archaeology, no retention policy — explicitly out of scope for v1.

Demonstrable outcome: start an ACP chat session from a test client against a dev host-service; open the same session from the mobile app through the relay; watch agent message chunks stream live on mobile; answer a permission request from mobile; run two clients at once and see both receive identical ordered updates, with the second client answering a permission request the first one ignored.

## Assumptions

- Anthropic auth requires no work: the adapter inherits the host machine's existing Claude Code login (`~/.claude` OAuth for the logged-in user). Confirmed as Decision D9.
- Mastra stays untouched and shippable throughout. Every change here is additive: new files, new router namespace, new WS route, new package. The word "chat" in existing code keeps meaning mastra; the new world uses "acp sessions" naming.
- The adapter is `@agentclientprotocol/claude-agent-acp` (official ACP org; 0.58.1 as of 2026-07-09, published the same day, depending on **current** `@agentclientprotocol/sdk@1.2.1` and **current** `@anthropic-ai/claude-agent-sdk@0.3.205`). We pin it exactly. Zed's older `@zed-industries/claude-code-acp` (stale pins: protocol sdk 0.14.1, agent sdk 0.2.44, last published 2026-03) is superseded and not used. See Decision D13.
  - *Version actually installed (2026-07-09):* the root `bunfig.toml` enforces `minimumReleaseAge = 259200` (3 days, supply-chain gate), which blocks same-day 0.58.1. Installed the newest eligible pair instead: adapter **0.56.0** (exact) + our own protocol sdk dep **1.2.0**; the adapter internally pins sdk 1.1.0 — version skew is fine, ACP negotiates `protocolVersion` at initialize (spike ran green with this pair). Bump both to 0.58.x / 1.2.1 once they clear the age gate (0.57.0 eligible 2026-07-10, 0.58.1 eligible 2026-07-12) — do not bypass the gate.
- Milestone 0 (spike) gates the rest of the plan: the adapter's actual capability coverage (session loading, model selection, question prompts, plan approvals) is verified empirically before any production code depends on it, and its results are recorded in this document's capability matrix.

## Open Questions

- **Q1 — Adapter capability gaps found in the spike.** If the adapter turns out not to support something we need (e.g. model switching or AskUserQuestion fidelity), we choose per-gap: live without it for v1, pass it via ACP `_meta`, or (worst case, explicitly approved) revisit the self-implemented-agent option. → Decision D14 placeholder, filled by Milestone 0.
- **Q2 — Session creation trigger.** Does mobile create ACP sessions itself (a `create` mutation) or only attach to sessions created elsewhere for v1? Mobile today never creates mastra sessions. Default assumption: expose `create` from day one since it is nearly free, but the mobile UI may not surface it. → Resolved in M4: mobile creates sessions itself — see D15.

## Progress

- [x] (2026-07-09 18:00Z) Discovery: mapped mastra harness call sites, host-service transport, relay streaming constraints, Claude Agent SDK 0.3.205 surface.
- [x] (2026-07-09 18:30Z) First round of decisions (scope, transport, type strategy, migration) — see D1–D8.
- [x] (2026-07-09 19:15Z) Second round: parallel-to-mastra scope, keep-alive processes, live-only sessions, auth via host login (D9–D12); evaluated ACP as protocol alternative; chose the ACP-adapter approach (D13).
- [x] (2026-07-09 20:30Z) Ecosystem survey: found the official `@agentclientprotocol/claude-agent-acp` adapter (current pins — supersedes Zed's) and surveyed ACP client libraries (`use-acp`, AI SDK community provider) → D13 amended, D16 added, React hooks pulled into scope.
- [x] (2026-07-09 21:15Z) Milestone 0: a temporary spike script was run end-to-end against a throwaway git repo — all scenarios green (init, session/new, 5 prompts, permission flow, plan mode, set_mode, set_config_option, list, load-in-fresh-process, cancel, SIGKILL crash). Capability matrix recorded below; D14 filled. Raw evidence: `events.jsonl` (JSONL of every frame) in the session scratchpad `acp-spike/run1/`. The one-off script was removed after its findings were captured.
- [x] (2026-07-09 23:30Z) Milestone 1: `packages/session-protocol` shipped — full ACP type re-export (`src/acp.ts`), session state + envelope types, zod router inputs + cursor helpers (`src/api.ts`), pure fold reducer (`src/fold/`, 18 tests), WS stream client with dedup/gap/reset/reconnect (`src/client/subscribeToSession/`, 9 tests), React hooks `useAcpSession`/`useAcpPermissions` (`src/react/`), cursor/schema tests (6). 33 tests green (`bun test` in the package); repo `bun run typecheck` green; package added to `apps/mobile` deps with mobile typecheck green; `bun run lint` exit 0. Hooks are thin orchestration over the tested fold/client modules — their behavior gets E2E coverage on mobile in M4.
- [x] (2026-07-09 01:30Z+1d) Milestone 2: host-service `AcpSessionManager` + `acpSessions` tRPC router shipped. Runtime: `src/runtime/acp-sessions/` — `SessionJournal` ring buffer (5 unit tests green) + manager owning one `claude-agent-acp` child per session over the sdk's `client()`/`connect()` (create/get/list/getMessages/prompt/respondToPermission/cancel/setMode/setConfigOption/subscribe/adapterPid/dispose). Router: `src/trpc/router/acp-sessions/` mounted as `acpSessions` in `appRouter`, thin passthrough with typed error mapping (NOT_FOUND / PRECONDITION_FAILED / CONFLICT). Wiring: `types.ts` runtime member, `app.ts` construction (`resolveWorkspaceCwd` from the workspaces table) + dispose chain + `acpSessions` test override. Acceptance: gated integration test (`ACP_E2E=1 bun test test/integration/acp-sessions.integration.test.ts`) 3/3 green against the real adapter — default-mode creation (D14-c), prompt→folded getMessages timeline, gapless seq from 1, permission blocks turn / first respond wins / second `already_resolved`, SIGKILL'd adapter → dead + dropped from list while siblings live. Repo `bun run typecheck` green, `bun run lint` exit 0, zero diffs under mastra paths (`packages/chat/`, `runtime/chat/`, `router/chat/`).
- [x] (2026-07-09 22:00Z) Milestone 3: WS update stream shipped. Route: `packages/host-service/src/runtime/acp-sessions/stream.ts` — `registerAcpSessionStreamRoute` serving `/acp-sessions/:sessionId/stream?since=<seq>`, one JSON `SessionUpdateEnvelope` per WS message; a `since` cursor replays the journal tail before going live, absent `since` starts live-from-now, and unservable cursors get a terminal `reset` frame (`invalid_since`, `session_not_found`, manager-emitted `journal_evicted`) instead of a bare close, so `subscribeToSession` clients stop cleanly rather than reconnect-looping (D20). Back-pressure: 8MB `bufferedAmount` cap, same rationale as the terminal route. Wiring: `app.ts` applies the existing `wsAuth` guard to `/acp-sessions/*` and registers the route beside the terminal/events WS routes. Acceptance: 6/6 always-run route tests (`src/runtime/acp-sessions/stream.test.ts` — journal-backed stub source + real Hono/@hono/node-ws server + the real M1 client, covering replay+live fan-out identical across subscribers, cursor catch-up with no gaps/dups, eviction reset, unknown session, malformed since, live-only default); 3/3 gated E2E (`ACP_E2E=1 bun test test/integration/acp-sessions-stream.integration.test.ts`) against the real adapter — two concurrent subscribers see the identical gapless stream of a live turn, a mid-turn dropper resumes from its cursor with no gaps or duplicates, an evicted cursor resets and a state-snapshot resync re-attaches cleanly. Repo `bun run typecheck` green, `bun run lint` exit 0, mastra paths untouched. Relay-leg verification of this route is folded into M4's mobile E2E.
- [x] (2026-07-10 00:40Z) Milestone 4: mobile surface shipped and verified end-to-end by tap-driving the simulator. Mobile pieces: `apps/mobile/lib/host/client.ts` (relay tRPC caller mirroring the host envelope + `createAcpSessionsApi`/`buildAcpStreamUrl`/`getHostAuthToken`), route `app/(authenticated)/workspace/[id]/chat/acp/[sessionId].tsx` → `AcpSessionThreadScreen` (routing-key + JWT gate) → `SessionThread` over `useAcpSession`/`useAcpPermissions`, timeline renderers (message / tool call / plan + permission card with option buttons), and a "New live session" row on the chat sessions screen (D15). Host resolution is v2-only (`useWorkspaceHost` over v2Hosts querying each online host's `workspace.list`; no v1 anywhere in the path). Styling matches the mastra chat screen 1:1: same transparent glass header, forked ChatComposer (Liquid Glass surface, keyboard-aware padding, sync submit), mastra message-bubble classes, borderless tool-call rows. Contract change en route: prompt became admission-ack (D21) after the relay's 30s buffered-HTTP timeout 502'd the long-poll during the first tap-driven run. Evidence, all through the local relay against the dev desktop host: (a) transport E2E (scratchpad `e2e-mobile-transport.ts`, byte-identical client behavior to `lib/host/client.ts`) 22/22 checks — create → two concurrent WS subscribers → prompt admission-ack → `permission_requested` frame → respondToPermission (`resolved`) → turn end observed via journaled `state` frames (`end_turn`) → identical folded timelines across subscribers → late-joiner `since=0` replay parity → `getMessages` history parity → file written on disk; (b) Maestro tap flow (`02-full-acp-flow.yaml`) green: sign-in → workspace → New live session → type prompt → Submit → permission card streams in → tap Allow → tool Pending→Completed + "Allowed" + agent prose lands → `mobile-tap-e2e.txt` on disk with exact content (screenshots flow-01…flow-10); (c) mastra regression gate: zero diffs under `packages/chat/`, `runtime/chat/`, `router/chat/`. Repo `bun run typecheck` green, `bun run lint` exit 0, session-protocol 33/33, host-service unit suite green.
- [x] (2026-07-10 02:00Z) Milestone 4 follow-through, all tap-verified on the simulator through the relay: composer model/effort/mode pickers driven by the adapter-reported `configOptions`/`modes` catalogs (nothing hardcoded — D14-d as designed); a "working…" indicator while a turn runs; host fix for `setConfigOption` (the refreshed catalog rides the ACP *response*, not a follow-up notification — the manager now folds the response into state and journals it, otherwise pickers went stale); and **native AskUserQuestion**: host now advertises `elicitation.form`, handles `elicitation/create` as pending-question cards, and the built-in tool works end-to-end (D22). A same-day MCP-bridge detour for ask_user was built, verified, and deleted once the native path was found. Evidence: transport test (scratchpad `e2e-ask-user.ts`) — unprompted `AskUserQuestion` call → `permission_requested` whose card title is the question text (not the tool name) attached to the real `toolCallId`, options `[Mango, Papaya, Lychee, Skip]`, answer resumes the same turn → agent replies `FRUIT CHOSEN: Papaya`; Maestro phone flow green with screenshots (question card → tap Papaya → Completed/Allowed → exact reply). `bun run lint` exit 0, host-service typecheck green.

## Surprises & Discoveries

- Observation: the relay cannot stream HTTP responses — `sendHttpRequest` in `apps/relay/src/tunnel.ts` buffers one complete response per request, so SSE cannot traverse the relay. The relay *does* proxy arbitrary WebSocket channels (`openWsChannel`/`sendWsFrame`, used by `/terminal/*` today). This is why the client stream is WS.
  Evidence: `apps/relay/src/tunnel.ts:343-404`.
- Observation: `packages/chat-protocol` and `packages/durable-session` are referenced in `AGENTS.md` but were never built. This plan supersedes the old "SCP v1" normalized-envelope idea — ACP *is* the normalized envelope, maintained upstream.
- Observation (M0 spike): the adapter's default session mode is **`bypassPermissions`** — every tool call auto-approved, `session/request_permission` never fires until the mode is changed. The Claude Agent SDK even prints a `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` warning on the adapter's stderr. Forced D14-c (manager sets `default` mode at creation).
  Evidence: `session/new` response `modes.currentModeId: "bypassPermissions"`; spike run1 stderr log.
- Observation (M0 spike, corrected after inspecting the installed adapter): the spike's client did not advertise `elicitation.form`, so adapter 0.56.0 deliberately disabled `AskUserQuestion`; the model searched its available tools, found no match, and asked in plain text. The installed adapter already contains the `AskUserQuestion` → ACP form-elicitation bridge. The remaining gap is in Superset: advertise the capability, handle and journal `elicitation/create`, add the proposed state/envelope/API shapes, and render/respond to the form. → D14-a. *Closed in the M4 follow-through* — capability advertised, `elicitation/create` handled, tap-verified; see D22.
- Observation (M0 spike): pleasant surprises — `initialize` advertises `_meta.claudeCode.promptQueueing: true` (prompts sent mid-turn are queued, useful for multi-client races); permission `toolCall`s carry structured diffs (`oldText`/`newText`) ready to render; `session/load` in a *fresh adapter process* replays the full timeline as ordinary `session/update` notifications and the session is immediately promptable (Claude's on-disk store survives the process) — a free recovery path beyond v1's live-only scope.
- Observation (M0 spike): the root `bunfig.toml` `minimumReleaseAge = 259200` (3-day supply-chain gate) blocked the same-day adapter 0.58.1; installed 0.56.0 + sdk 1.2.0 instead (see Assumptions). The gate is policy — bump versions when eligible rather than bypassing.
- Observation: ACP v1.2 (`@agentclientprotocol/sdk@1.2.1`) is much richer than its overview docs suggest: `session/list` is cursor-paginated, `session/load` replays history, `session/fork`/`resume`/`close`/`set_mode`/`set_config_option` and `providers/list|set` exist, the package *contains* generated zod schemas (though its exports map hides them — see D14-b), and it includes WS/SSE/HTTP server transports. `_meta` fields are the sanctioned extension point on every type.
- Observation: the official ACP org maintains a Codex adapter (`@agentclientprotocol/codex-acp@1.1.2`) — the future-codex story is "same wire, second adapter binary".
- Observation (2026-07-09, ecosystem survey): the ACP org also publishes **`@agentclientprotocol/claude-agent-acp`** — "An ACP-compatible coding agent powered by the Claude Agent SDK", at 0.58.1, published the very day of this survey, depending on current `@agentclientprotocol/sdk@1.2.1` + `@anthropic-ai/claude-agent-sdk@0.3.205`, maintained by Zed/ACP people (Conrad Irwin et al.). Zed's `@zed-industries/claude-code-acp@0.16.2` is frozen on protocol sdk 0.14.1 / agent sdk 0.2.44 since March — the "stale adapter pin" risk that shadowed the adapter decision largely disappears by switching to the official package.
  Evidence: `npm view @agentclientprotocol/claude-agent-acp` vs `npm view @zed-industries/claude-code-acp` (versions, `time.modified`, dependency pins).
- Observation (M3): under `bun test`, a `@hono/node-server` instance wedges on graceful `server.close(cb)` when the *server* initiated a WS close — the upgraded socket lingers half-accounted in bun's ws compat layer. Teardown must call `server.closeAllConnections?.()` first. Both stream test suites carry this.
- Observation (M3): the adapter keeps emitting trailing `session/update` notifications *after* the `session/prompt` response resolves, so a `lastSeq` snapshot taken at turn end can be overshot by live subscribers moments later. Tests must wait with `>=` and compare only the prefix up to the snapshot; clients don't care (the fold is total and seq-ordered either way).
- Observation (2026-07-09, ecosystem survey): ACP **client** libraries exist but none is adoptable today. `use-acp` (marimo-team, 0.2.6) is React hooks for ACP-over-WebSocket with a genuinely nice API (`useAcpClient` → connection state, notifications timeline, permission request/response handling, `groupNotifications()`/`mergeToolCalls()` helpers) — but it pins protocol sdk `^0.4.9` (pre-v1 wire, incompatible with 1.2.1) and peer-depends on `react-dom` (not React Native-clean). The Vercel AI SDK community provider `@mcpc-tech/acp-ai-provider` (0.3.3) wraps ACP agents as an AI SDK `LanguageModel` — but it is server-side only and *spawns the agent process itself*, which is the wrong side of our topology (the host already owns the process; our clients are remote over the relay), pins protocol sdk `^0.14.1`, and self-describes as experimental (no model selection, manual lifecycle). Conclusion: use `use-acp`'s hook API as the design reference, ship our own hooks (D16); watch both libraries as the ecosystem matures.
- Observation (M4 follow-through): `session/set_config_option`'s refreshed catalog arrives **in the RPC response**, not as a `config_option_update` notification — a host that only folds notifications leaves every attached client's picker stale after a change. The manager now folds the response payload into state and journals a state frame. (The spike matrix said "Set returns the full refreshed `configOptions` and emits `config_option_update`" — against 0.56.0 in our harness the notification did not arrive; only the response carried it.)
- Observation (M4 follow-through, the ask_user saga): the adapter **silently disables** the built-in `AskUserQuestion` tool unless the client's `initialize` declares `clientCapabilities.elicitation.form` (adapter source: `disallowedTools = elicitationSupport.form ? [] : ["AskUserQuestion"]`). Because the tool never appears in any session, the gap is invisible in journals — we first built a whole MCP ask_user bridge (HTTP server + auto-allow interception) and fully verified it on the phone before finding the one-line capability gate; the bridge was then deleted the same day in favor of the native path (D22). Lesson recorded: when a built-in capability seems missing, grep the adapter's dist for the tool name before building around it.
- Observation (M4): RN `ScrollView`/`FlatList` swallows the first tap while the keyboard is up (it dismisses the keyboard instead) — permission-card buttons needed `keyboardShouldPersistTaps="handled"` on the thread list to be tappable mid-composition.
- Observation (M4, sim-driving): Maestro can only tap what RN exposes to accessibility — a parent with an `accessibilityLabel` *replaces* its children's text in the a11y tree (workspace rows are one blank element), so those rows are reachable only by coordinate taps; Maestro text selectors are full-match regexes; the Expo dev-launcher screen may intercept cold starts and must be dismissed by tapping the dev-server URL.

- Decision D1: The new runtime lives **only in host-service**; clients attach remotely (mobile via relay) or locally (desktop, later).
  Rationale: single process owner; multi-client requirement.
  Date/Author: 2026-07-09 / Kirill.
- Decision D2 (superseded by D13): wire protocol was to carry Claude SDK events verbatim in a custom envelope. Replaced by ACP frames verbatim in the same style of envelope — the "no hand-maintained facade types" goal survives, the type *source* changed from the Claude SDK to ACP. The original design is preserved in `plans/session-harness-claude-agent-sdk.md`.
- Decision D3 (amended): originally "kill mastra entirely, zero backwards compatibility". Amended 2026-07-09: mastra is in production; the new runtime ships **in parallel** and disturbs nothing. The kill becomes a future hard-swap plan. Zero-migration still holds — old mastra threads will never be readable from the new path.
  Date/Author: 2026-07-09 / Kirill.
- Decision D4: Codex future-proofing costs nothing extra now: ACP is agent-agnostic and an official Codex adapter exists. No abstraction layers are built for it in v1.
  Date/Author: 2026-07-09 / Kirill + Claude.
- Decision D5: Real-time transport to clients is **WebSocket carrying sequence-numbered envelope frames** (relay-proxied today). Delivery is at-least-once with client dedup by `seq`; gaps heal via re-attach with cursor, and cursor-unservable triggers a full state resync. SSE is not used (relay constraint); the design leaves it trivially addable for direct connections later.
  Rationale: neither WS nor SSE guarantees delivery; the seq/cursor journal does, transport-independently.
  Date/Author: 2026-07-09 / Kirill (directional) + Claude (mechanism).
- Decision D6 (simplified): No SQLite registry, no JSONL transcript reads. The host keeps live sessions in memory only; message history and catch-up are served from the per-session **frame journal** accumulated since session start. Host-service restart ⇒ sessions are gone ⇒ they disappear from `list` (per D11/D12 scope).
  Date/Author: 2026-07-09 / Kirill ("if a chat died — for now just say we done").
- Decision D7 (amended twice; zod half superseded by D14-b): `packages/session-protocol` re-exports the **entire** ACP type surface from `@agentclientprotocol/sdk` (`export type * from ...`) — never a hand-picked subset, which would just be a facade with extra steps that drifts the moment upstream adds a variant. **Both sides import the typing entirely and exclusively through this package**: mobile for rendering/inputs, host-service for the manager, router schemas, and journal. Host-service imports the sdk directly only for runtime connection machinery (stdio transport classes); every ACP *type* it names still comes from session-protocol, so the two sides can never diverge. The package never imports the adapter or `@anthropic-ai/claude-agent-sdk`; its exports are type-only, zod values, or React hooks (pure JS, React-Native-safe).
  Date/Author: 2026-07-09 / Kirill ("we still need to import the typing entirely on both sides") + Claude.
- Decision D8 (amended by D14-a; the "dedicated elicitation shape" half revised by D22): Current v1 tool approvals and plan approval ride ACP `session/request_permission`. They use one pending-permissions list, one `respondToPermission` procedure, first answer wins, and typed `ALREADY_RESOLVED` for losers. This entry originally required a future structured-question surface to add explicit pending-elicitation state and a dedicated response shape; D22 chose to render simple option-questions through the existing pending-permission model instead, keeping the dedicated shape as future work for richer forms.
  Date/Author: 2026-07-09 / Claude.
- Decision D9: **Auth = the host machine's logged-in Claude account.** No credential plumbing; the adapter subprocess inherits the user environment.
  Date/Author: 2026-07-09 / Kirill ("just automatically does it — a").
- Decision D10: Web app is out of scope. v1 surface = host-service + mobile only. Desktop consumes nothing from this plan yet.
  Date/Author: 2026-07-09 / Kirill.
- Decision D11: **No idle disposal.** Adapter processes are kept alive for the host-service's lifetime. Reads (`getMessages`) are only valid for live sessions.
  Date/Author: 2026-07-09 / Kirill ("keep it alive forever").
- Decision D12: No transcript retention/GC concerns in v1. We only care about sessions we started that are currently running.
  Date/Author: 2026-07-09 / Kirill.
- Decision D13 (amended): **Protocol = ACP v1; agent = an off-the-shelf adapter**, one child process per session, ACP over stdio to the host. Originally the adapter was Zed's `@zed-industries/claude-code-acp`; amended same day to the **official `@agentclientprotocol/claude-agent-acp`** after discovering it — actively published (0.58.1, same-day release), pinned to *current* protocol sdk 1.2.1 and *current* claude-agent-sdk 0.3.205, maintained under the ACP org by the same Zed people. This removes the stale-SDK-pin risk that was the main cost of the adapter choice.
  Rationale: least code and no protocol authorship; types + client machinery come from `@agentclientprotocol/sdk`. Remaining accepted risks: upstream release cadence, an extra subprocess layer, and unverified capability coverage (gated by the Milestone 0 matrix). Escape hatch that makes this safe: **the wire stays standard ACP no matter what** — if the adapter becomes the bottleneck, host-service can implement the ACP agent side directly against the latest Claude Agent SDK (the design in `plans/session-harness-claude-agent-sdk.md`) with zero client-visible change.
  Date/Author: 2026-07-09 / Kirill (adapter direction) + Claude (official-package swap).
- Decision D14 (filled from the Milestone 0 matrix, 2026-07-09): the spike found no fatal gaps — prompt/stream/permissions/modes/model-selection/list/load/cancel/crash-detection all work (see matrix). Per-gap calls on what's missing or surprising:
  - **D14-a — AskUserQuestion (resolved by D22):** originally, with Superset's client capabilities, the adapter disabled the tool; questions arrived as plain agent text, the turn ended, and the user's answer was a new prompt. The M4 follow-through closed this: the host now advertises `elicitation.form` and handles the adapter's `elicitation/create`, so answering resumes the original turn. The implementation deliberately reuses the pending-permission surface instead of the "explicit pending-elicitation state/envelope/API shapes" this entry proposed — see D22 for the shape and its limits.
  - **D14-b — zod schemas not exported by the sdk:** `session-protocol` re-exports ACP *types* only (`export type * from`); runtime validation uses our own small zod schemas for OUR API inputs/envelope, with ACP payloads passed through typed (they were already validated by the sdk's own parsing at the stdio boundary). If strict re-validation is ever needed, the sdk exports `./schema/schema.json` (full JSON Schema) to compile from. Amends the zod half of D7; the "entire type surface, no curated subset" half is unchanged.
  - **D14-c — default mode is `bypassPermissions`:** unacceptable default for a host-owned harness. `AcpSessionManager` sets mode explicitly at session creation; v1 default `default` (manual approval, exercises our permission UX), overridable per session via the exposed `setMode`.
  - **D14-d — model/effort selection:** works via `session/set_config_option` (`model`, `effort` selects) — expose `setConfigOption` in the router as planned, no spike-gating caveat needed anymore.
  - **D14-e — thought/plan update variants unobserved:** `agent_thought_chunk` and `plan`/`plan_update`/`plan_removed` didn't occur in the spike turns (no extended thinking, no todo-list turn). No action — the envelope carries `SessionUpdate` verbatim, so unseen variants flow through untouched; hooks must simply not throw on variants they don't render (covered by M1 tests).
- Decision D15: **Mobile creates ACP sessions in v1.** The workspace session list exposes “New live session,” generates the public Superset session ID, calls `acpSessions.create`, and opens the new thread. The adapter's internal ACP session ID remains host-private.
  Date/Author: 2026-07-09 / Claude.
- Decision D16: **Client React hooks are ours, in `@superset/session-protocol/react`, modeled on `use-acp`'s API.** Surveyed candidates: `use-acp` (right shape, wrong protocol era — sdk ^0.4.9 vs our 1.2.1 — and `react-dom` peer dep blocks RN) and the AI SDK ACP provider `@mcpc-tech/acp-ai-provider` (server-side LanguageModel wrapper that spawns the agent itself — wrong side of our client/host topology, and it flattens ACP's permission flow, which is the heart of our UX). Neither mainstream option fits today, so we ship a small hooks module — `useAcpSession` (state + history + live subscribe + fold), `useAcpPermissions` (pending list + respond) — over our transport helper, peer-depending only on `react` (no `react-dom`), borrowing `use-acp`'s notification-grouping/tool-call-merging helper ideas. Revisit if `use-acp` reaches protocol v1 or an official ACP react package appears.
  Date/Author: 2026-07-09 / Kirill ("react hooks could be nice... ideally more mainstream like vercel ai sdk") + Claude (survey + recommendation).
  Provenance note (added 2026-07-09 after the name caused confusion): `useAcpSession` is **not** an official/npm hook — it is authored in this repo at `packages/session-protocol/src/react/useAcpSession/`. Nothing React-facing exists upstream at protocol v1; the only upstream pieces in this stack are the ACP types (`@agentclientprotocol/sdk`) and the adapter binary (`@agentclientprotocol/claude-agent-acp`). The name deliberately mirrors `use-acp`'s API shape so a future migration to a mainstream ACP hooks package is a rename, not a rewrite.
- Decision D17: **`AcpSessionManager` takes a `resolveWorkspaceCwd` callback, not a db handle.** `app.ts` supplies a closure over the workspaces table (same query `ChatRuntimeManager` runs); tests pass a fixture-dir resolver. Decouples the manager from drizzle and makes the integration test need no database.
  Date/Author: 2026-07-09 / Claude.
- Decision D18: **`getMessages` serves every `update` frame plus `permission_requested`/`permission_resolved`** (state/reset frames excluded), deviating from the earlier "message/tool variants only" plan text. The fold reducer is total over update variants, and a seeded timeline needs plans/thoughts/permissions to render history identically to the live stream — filtering variants server-side would make paged history diverge from what a live subscriber saw.
  Date/Author: 2026-07-09 / Claude.
- Decision D19: **State frames are journaled on meaningful transitions** (status change, mode/config change, permission add/settle, turn end, death) so a WS subscriber catching up via `after(since)` replays status history in order; they carry a snapshot whose `lastSeq` is their own envelope seq. They are excluded from `getMessages` (D18) since they're not timeline content. Permission settlement is funneled through one first-wins `settlePermission` path shared by respondToPermission, cancel, adapter-side request abort, and death — which is what makes the `already_resolved` contract airtight.
  Date/Author: 2026-07-09 / Claude.
- Decision D20: **The stream route answers every unservable subscription with a terminal `reset` frame, never a bare WS close.** Unknown session → `session_not_found`; malformed `since` → `invalid_since`; evicted cursor → the manager's own `journal_evicted` envelope (route just relays it, then closes). Rationale: `subscribeToSession` treats an unexplained close as transient and reconnects with backoff forever — a reset frame is the one signal that stops it and hands control to the resync path. Synthesized resets carry nominal `seq: 0` and are never journaled; the client short-circuits on `kind: "reset"` before any seq validation, so the nominal value is never inspected. The route is server-to-client only (client messages ignored — inputs ride tRPC) and drops subscribers whose socket `bufferedAmount` exceeds 8MB (close 1013; reconnect-with-cursor heals), mirroring the terminal route's back-pressure policy.
  Date/Author: 2026-07-09 / Claude.
- Decision D21: **`prompt` acknowledges admission, not turn completion.** The host journals the outbound user content before sending ACP `session/prompt`, returns `{ accepted: true }` immediately, and publishes stop reason or failure in later state envelopes. The in-process manager still exposes the turn promise for integration tests. Rationale: a turn can wait on human permission for minutes or hours, while the relay buffers HTTP requests for only 30 seconds; holding the mutation open produced a relay timeout even though the turn continued successfully.
  Date/Author: 2026-07-09 / Claude.
- Decision D22: **Native AskUserQuestion via ACP form elicitation, rendered through the existing pending-permission cards.** The host's `initialize` declares `clientCapabilities: { elicitation: { form: {} } }` (UNSTABLE ACP extension — this is also what re-enables the adapter's built-in `AskUserQuestion` tool; see the capability-gate observation in Surprises). The manager handles `elicitation/create`: it extracts the `question_<n>` select fields from the form schema and parks **one pending-permission card per question, sequentially** — card title = the question text, options = the answer labels plus a host-appended `Skip` (`reject_once`); the chosen label is returned as the elicitation `accept` content keyed by field, `Skip` omits that key (the tool's documented "skipped" contract), and any non-selected settle (cancel/abort/death) cancels the elicitation. Cards attach to the adapter's real `toolCallId`, so the timeline shows one question card that resolves in place and the original turn resumes. Rationale (revising the dedicated-shape half of D8): zero new state/envelope/API/mobile surface — the permission cards were already phone-verified — and clients that predate this change render questions correctly with no update. Accepted v1 limits: multiSelect questions render as single-select (answer returned as a one-element array); free-text custom answers (`question_<n>_custom`) are not offered; non-form elicitation modes are cancelled; form elicitations with no `question_<n>` selects (arbitrary MCP-server elicitations) are declined. A dedicated elicitation surface remains the follow-up if those limits start to bite. Supersedes the same-day MCP ask_user bridge (built, phone-verified, then deleted — the native tool makes it redundant, keeps the model's unprompted question-asking behavior, and removes a server plus an auto-allow hack from the host).
  Date/Author: 2026-07-10 / Kirill ("swap to native elicitation") + Claude (mechanism).

## Outcomes & Retrospective

Written at v1 completion (M0–M4 all green, 2026-07-10). What shipped, against the Purpose: a second host-owned session runtime speaking standard ACP to `claude-agent-acp` children, a thin seq-journal envelope over the relay's WS proxying, `packages/session-protocol` as the single type/hook source for both sides, and a mobile surface that creates sessions, streams turns live, drives permissions/questions/pickers, and matches the mastra screens 1:1 — with zero diffs under any mastra path. Every acceptance was verified two ways: a transport-level E2E script through the local relay, and Maestro tap-driving the simulator like a user.

What went better than planned:
- The bet on **not authoring protocol** paid off end to end — the only authored contracts are the envelope, the session state object, and the router inputs; every ACP payload flows verbatim from adapter to phone.
- The adapter had **no fatal capability gaps** (D14) — and the one apparent gap (AskUserQuestion) turned out to be our own missing capability declaration, not a missing feature (D22).
- The fold/journal design absorbed every surprise (trailing updates after prompt-resolve, response-carried config updates, elicitation cards) without client changes — new frame producers just journal and broadcast.

What cost real time, and the lessons:
- **The MCP ask_user detour**: a full bridge server was built and phone-verified before discovering the adapter's one-line capability gate (`disallowedTools` unless `elicitation.form`). The tool being *silently disabled* made the gap invisible in every journal. Lesson: when a built-in behavior seems absent, read the adapter's dist for the feature name before building a replacement.
- **The relay's 30s buffered-HTTP window** broke the original prompt-returns-stopReason contract only once a human-latency permission sat in the loop — surfaced by the first real tap-driven run, not by any transport test with instant programmatic approvals (D21). Lesson: E2E with real human-speed interaction finds contract bugs that scripted E2E cannot.
- **Sim-driving friction** (Maestro a11y visibility, dev-launcher interception, keyboard tap-through) is now recorded in Surprises; the flows in the session scratchpad are the reusable recipe.

Deferred, deliberately: dedicated elicitation state/API for rich forms (D22 limits), session resume via `session/load` (spike-proven, out of v1 scope), desktop consumption and the mastra hard-swap (next plan), adapter version bump to 0.58.x once it clears the release-age gate.

## Context and Orientation

Definitions used throughout:

- **ACP (Agent Client Protocol)**: a JSON-RPC 2.0 protocol standardizing editor/client ↔ coding-agent communication (agentclientprotocol.com). The **client** sends `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/set_mode`, `session/list`, `session/load`; the **agent** streams `session/update` notifications (variants: `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `plan_update`, `plan_removed`, `available_commands_update`, `current_mode_update`, `config_option_update`, `session_info_update`, `usage_update`) and calls back `session/request_permission` when it needs a human decision (answered with a `PermissionOption` outcome: allow-once / allow-always / reject variants). Every type carries an optional `_meta` object reserved for implementation extensions. TS types: `@agentclientprotocol/sdk` (its generated zod schemas exist in the tarball but are not exported — D14-b).
- **The adapter** (`@agentclientprotocol/claude-agent-acp`): an executable that speaks ACP on stdio and internally drives Claude Code via the Claude Agent SDK. Maintained by the ACP org (originated from Zed's `claude-code-acp`, which it supersedes); we run it headless, one process per session. The spike confirms its bin entry point name.
- **Spike** (not an acronym): a time-boxed exploratory prototype used to retire technical uncertainty before production implementation. Milestone 0 used one to drive the real adapter through auth, prompts, permissions, modes, configuration, list/load, cancellation, and crash behavior. It produced the capability evidence for D14 and was removed afterward rather than retained as production tooling.
- **Host-service** (`packages/host-service`): a Hono HTTP server on the user's machine. Desktop spawns it locally (`apps/desktop/src/main/host-service/index.ts`); it dials a persistent WebSocket tunnel to the **relay** (`apps/relay`, Fly.io) so remote clients reach it at `https://<relay>/hosts/:hostId/trpc/*` (buffered HTTP) and `wss://<relay>/hosts/:hostId/<path>` (frame-streaming WS). Its tRPC router: `packages/host-service/src/trpc/router/router.ts`; WS routes today: `/events`, `/terminal/*` (see `registerEventBusRoute` / `registerWorkspaceTerminalRoute` wired from `src/app.ts`).
- **The mastra path (do not touch)**: `packages/host-service/src/runtime/chat/chat.ts` (`ChatRuntimeManager`), `src/trpc/router/chat/chat.ts` (`chat` router), `packages/chat` (shared mastra service + `useChatDisplay` polling hook), desktop chat UI, and mobile's current facade `apps/mobile/lib/trpc/host-chat-types.ts` + `useChatThread` polling `chat.getSnapshot` at 250ms. All of it keeps running unchanged.
- **`chat_sessions` / Electric**: cloud Postgres session directory synced to clients. ACP sessions may register there later for cross-device listing; v1 keeps it simple — live sessions are listed from the host directly (mobile already talks to the host through the relay).

Repository conventions that apply (from `AGENTS.md`): Bun + Turbo monorepo; Biome at root (`bun run lint` must exit 0 — CI fails on warnings); one-folder-per-component with co-located tests; object-parameter signatures for functions with 2+ params; no `any`.

### End-to-end comparison: ACP vs direct Claude Agent SDK

Both designs target the same product story: a user starts a live session on Device A, attaches to that same host-owned session from Device B, answers or approves agent requests from either device, changes settings, survives a client reconnect, and receives a clear failure when the agent or host dies. IDs and payload examples are implementation details; the load-bearing comparison is where process ownership, translation, and paused human interactions live. The direct-SDK column reflects the final v1 scope decisions, which override stale persistence and mastra-excision language later in its fallback plan.

| Concern | ACP adapter — selected and implemented | Direct Claude Agent SDK — fallback, not implemented |
|---|---|---|
| Host ownership | One `claude-agent-acp` child per Superset session; host-service is its ACP client over newline-delimited JSON-RPC/stdio. | Host-service owns the SDK `Query` and streaming input queue directly; no adapter child or ACP translation. |
| Session identity and directory | Public Superset session ID maps to a host-private ACP session ID. `list` returns live in-memory runtimes only. | Public Superset session ID maps to a host-private Claude session ID. Final v1 scope is also live-only even though the SDK can persist and resume. |
| Starting a turn | tRPC `prompt` journals the user's content, sends ACP `session/prompt`, and immediately acknowledges admission. Completion arrives in state envelopes. | A send mutation pushes an `SDKUserMessage` into the managed Query's input queue; completion likewise arrives through normalized state envelopes. |
| Streaming and multi-client attach | Adapter `session/update` → host seq journal → relay WebSocket. Each client seeds with `get` + `getMessages`, then subscribes with `since`. | SDK async iterator → host normalizer → the same seq journal and client attach contract. Only the host-local frame source changes. |
| Tool and plan approval | `toolCallId` identifies the visible timeline card; the ACP JSON-RPC `requestId` identifies the one blocked approval. First response wins and resumes the adapter/SDK callback. | SDK `toolUseID` identifies the card; callback `requestId` identifies the blocked `canUseTool` call. First response wins and resolves that callback directly. |
| Product questions | **Implemented (D22):** the host advertises `elicitation.form`, the adapter maps `AskUserQuestion` to `elicitation/create`, and the host parks one pending-permission card per question; answering resumes the original turn. Rich forms (multi-select UI, free text) are deferred. | `canUseTool("AskUserQuestion")` parks the original turn; host journals the typed request and returns the chosen answer through `updatedInput`. |
| Model, effort, and permission mode | Generic `setConfigOption` / `setMode` map through adapter-reported options; mobile renders those reported selectors rather than hardcoding values. | Host exposes explicit actions around Query controls such as `setModel`, flag settings, and `setPermissionMode`, then journals the resulting state. |
| Reconnect and stale cursor | `?since=<seq>` replays the retained tail; duplicates are dropped, gaps reconnect, and an evicted cursor triggers reset → state/history resync. | Same journal algorithm. The direct draft placed `since` in the first WS message, but that wire detail is not architecturally significant. |
| Cancellation | Host settles pending permission requests, sends ACP `session/cancel`, and keeps the session alive for the next prompt. | Host settles pending callbacks and calls `Query.interrupt()`, keeping the managed session alive. |
| Agent crash and host restart | Adapter exit marks the runtime dead and broadcasts final state. It disappears from `list`; host restart loses the in-memory session. | SDK/process failure marks the runtime dead the same way. SDK resume is technically available but explicitly outside final v1 scope. |
| Shared client contract | ACP types and updates are reused through `@superset/session-protocol`; the fold layer mainly groups and merges standard variants. | Superset must author and maintain the SDK-message envelope, normalizer, state projection, and tool/question view model. |
| Main tradeoff | Extra process and translation layer, plus adapter/integration capability lag; substantially less harness/protocol code owned by Superset. | Fewer runtime layers and immediate access to SDK features; substantially more custom normalization, lifecycle, and vendor-specific protocol surface owned by Superset. |

Three invariants from the end-to-end flow are easy to lose in lower-level API descriptions:

- **Turn parking:** a plain-text question ends the turn and its answer is a new prompt; an ACP elicitation or direct-SDK `AskUserQuestion` response resolves a parked request and resumes the original turn.
- **Two IDs, one tool card:** ACP `toolCallId` / SDK `toolUseID` identifies the visible tool card, while the request ID identifies the one blocked human decision. Resolving the request unblocks execution; subsequent tool output merges into the same card.
- **Seq is delivery order, not entity identity:** each Superset session has one gapless journal sequence shared by all attached clients. The journal is authoritative ordered replay history; mutable runtime state remains the source of full state snapshots.

Structured product questions were the last functional difference between the columns, and D22 closed it — both designs now cover the full v1 surface. ACP remains selected because its real-adapter path required less Superset-authored runtime code; direct SDK remains the escape hatch if adapter or integration lag becomes the bottleneck.

## Plan of Work

### Architecture at a glance

```
mobile (RN)                      host-service (user machine)
┌───────────────────┐   tRPC     ┌──────────────────────────────────────────┐
│ session list/state│──(relay)──▶│ acpSessions router                       │
│ prompt / permit   │            │        │                                 │
│                   │   WS       │        ▼                                 │
│ live updates      │◀──(relay)──│ AcpSessionManager                        │
└───────────────────┘            │  Map<sessionId, ManagedAcpSession>       │
  via useAcpSession /            │   ├─ frame journal (seq, ring buffer)    │
  useAcpPermissions hooks        │   ├─ folded SessionScopedState           │
                                 │   ├─ pending permission brokering        │
                                 │   └─ ACP client conn ── stdio ──▶ claude-agent-acp
                                 │                                    └──▶ Claude Code
                                 └──────────────────────────────────────────┘
```

Host-service is the ACP **client** of each adapter process, and a **fan-out proxy** toward N attached UI clients. UI clients do not speak raw JSON-RPC: request/response operations go over the existing tRPC surface (works through the relay's buffered HTTP today), and the one thing that genuinely needs streaming — `session/update` frames — goes over a dedicated WS route (works through the relay's WS proxying today).

### `packages/session-protocol` (`@superset/session-protocol`)

Thin by design. Dependencies: `@agentclientprotocol/sdk`, `zod`; peer dependency `react` (for the `./react` export only). Never imports the adapter or the Claude SDK (Decision D7). Layout per repo conventions:

```
packages/session-protocol/
  package.json          # exports ".", "./client", "./react"
  tsconfig.json
  src/
    index.ts            # barrel
    acp.ts              # export type * from "@agentclientprotocol/sdk" — the ENTIRE generated
                        # type surface, no hand-picked list. (The sdk's generated zod module is
                        # NOT exported by its package exports map — see D14-b — so no zod
                        # re-export here.) Both sides import ACP typing ONLY through this file.
    state.ts            # SessionScopedState, PendingPermission, SessionStatus
    envelope.ts         # SessionUpdateEnvelope
    api.ts              # our own zod schemas for the acpSessions router inputs/outputs
                        # (ids, cursors, prompt/permission params; ACP payloads typed passthrough)
    client/
      stream-client.ts  # subscribeToSession(): WS + since-cursor + gap detection + resync callback
    react/
      useAcpSession/    # state + latest history page + live subscribe, folded to render state
      useAcpPermissions/# pending list + respond(outcome) with ALREADY_RESOLVED handling
      utils/            # groupUpdates / mergeToolCalls — fold tool_call + tool_call_update
                        # streams into renderable items (API modeled on use-acp's helpers)
```

The `./react` hooks (Decision D16) are the intended way every client consumes sessions — mobile now, desktop at hard-swap time. They peer-depend on `react` only (no `react-dom`, no RN imports), take the tRPC caller and WS URL as arguments rather than importing any app's client, and are testable with plain React renderers. The API shape follows `use-acp` (connection state, updates timeline, permission handling) so a future migration to a mainstream ACP hooks library — if one reaches protocol v1 — is a rename, not a rewrite.

Own types — the entire authored surface of this plan:

```ts
export type HarnessKind = "claude-agent-acp"; // future: | "codex-acp"

export type SessionStatus = "starting" | "idle" | "running" | "awaiting_permission" | "dead";

export interface PendingPermission {
  requestId: string;            // JSON-RPC request id from the adapter, resolution key
  toolCall: ToolCallUpdate;     // ACP type, verbatim from the request
  options: PermissionOption[];  // ACP type, verbatim
  requestedAt: number;
}

export interface SessionScopedState {
  sessionId: string;            // Superset id (uuid) — the adapter's ACP SessionId is internal
  workspaceId: string;
  harness: HarnessKind;
  status: SessionStatus;
  currentMode: SessionModeState | null;   // ACP modes (incl. plan-ish modes), from current_mode_update
  configOptions: SessionConfigOption[];   // model picker etc., from config_option_update (spike-verified)
  pendingPermissions: PendingPermission[];
  cwd: string;
  lastSeq: number;
  lastStopReason: StopReason | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionUpdateEnvelope {
  seq: number;                  // per-session, monotonic from 1, gapless
  sessionId: string;
  ts: number;
  frame:
    | { kind: "update"; update: SessionUpdate }                          // ACP verbatim
    | { kind: "permission_requested"; pending: PendingPermission }
    | { kind: "permission_resolved"; requestId: string; outcome: RequestPermissionOutcome }
    | { kind: "state"; state: SessionScopedState }                       // full snapshot on change
    | { kind: "reset"; reason: string };                                 // cursor unservable → resync
}
```

Delivery semantics (the answer to "what if we miss stuff"): the host journals every envelope in a per-session ring buffer (default 5,000 frames). Subscribers connect with `since=<seq>`; the host replays `(since, latest]` then goes live. `seq` is gapless, so a client detects loss as a jump and reconnects with its last good seq; if that seq has been evicted, the host sends `reset` and the client re-syncs: `acpSessions.get` (state) + `acpSessions.getMessages` (history pages) + resubscribe from the returned `lastSeq`. Net: at-least-once delivery, deterministic gap detection, always-available repair — independent of WS/SSE/relay behavior.

Pagination: list endpoints take `{ limit (1..200, default 50), cursor?: string }` and return `{ items, nextCursor: string | null }`. `getMessages` pages walk the journal backwards from the newest frame and return every timeline-bearing `update`, `permission_requested`, and `permission_resolved` frame; state/reset frames are excluded (D18).

### Host runtime: `packages/host-service/src/runtime/acp-sessions/`

`AcpSessionManager` (new, sibling of the untouched `runtime/chat/`):

- `create({ sessionId, workspaceId })`: resolves `cwd` from the workspaces table exactly like `ChatRuntimeManager` does; spawns the `claude-agent-acp` bin (dependency of host-service) with the user's environment (D9); wraps stdio in `@agentclientprotocol/sdk`'s client-side connection; runs `initialize` (recording agent capabilities verbatim into state `_meta` for debuggability) then `session/new { cwd }`. Registers handlers: every `session/update` → fold into state + journal + broadcast; every `session/request_permission` → create `PendingPermission`, journal + broadcast, park the JSON-RPC promise until a client answers.
- `prompt({ sessionId, prompt })`: journals the outbound content, forwards ACP `session/prompt`, and immediately acknowledges `{ accepted: true }` (D21). Status folds to `running`; turn completion, `stopReason`, or failure arrives in later state frames.
- `respondToPermission({ sessionId, requestId, outcome })`: resolves the parked request exactly once; concurrent seconds get `ALREADY_RESOLVED`.
- `cancel({ sessionId })` → `session/cancel`. `setMode`, `setConfigOption` forwarded if the spike confirms adapter support.
- Process death (exit/stderr close): status → `dead`, one final `state` broadcast, journal retained in memory for already-attached clients, session excluded from `list` (D6/D11). No respawn.
- Keep-alive forever; no idle timers (D11).

### API: `packages/host-service/src/trpc/router/acp-sessions/`

New router namespace mounted beside (not touching) `chat`:

```
acpSessions.list({ workspaceId?, cursor?, limit })   → { items: SessionScopedState[], nextCursor }  // live only
acpSessions.create({ sessionId, workspaceId })       → SessionScopedState
acpSessions.get({ sessionId })                       → SessionScopedState
acpSessions.getMessages({ sessionId, cursor?, limit }) → { items: SessionUpdateEnvelope[], nextCursor }
acpSessions.prompt({ sessionId, prompt })            → { accepted: true }    // admission ack; turn end is streamed
acpSessions.respondToPermission({ sessionId, requestId, outcome })
acpSessions.cancel({ sessionId })
acpSessions.setMode({ sessionId, modeId })           // verified in M0 spike
acpSessions.setConfigOption({ sessionId, ... })      // verified in M0 spike (model/effort/mode selects)
```

### Stream: WS route in `packages/host-service/src/app.ts`

`/acp-sessions/:sessionId/stream?since=<seq>` — registered exactly like `/terminal/*` (same `wsAuth` guard, same `@hono/node-ws` upgrade), emitting one JSON `SessionUpdateEnvelope` per WS message. Mobile reaches it through the relay's existing WS channel proxying; no relay changes.

### Mobile: `apps/mobile`

- Add `@superset/session-protocol` dependency (types + our zod schemas + `subscribeToSession` + the `./react` hooks; all RN-safe — WS is native in RN).
- New screens parallel to the existing chat thread (which stays on mastra): `useAcpSession` provides the folded thread; message rendering maps ACP `agent_message_chunk`/`agent_thought_chunk`/`tool_call`/`tool_call_update`/`plan` onto the `ai-elements` components introduced in PR #5536; a permission sheet renders `useAcpPermissions().pending[].options` as buttons (ACP gives the labels and allow/reject kinds — no hand-rolled approval taxonomy).
- The tRPC calls ride the existing relay host client; the facade file is not extended — ACP types come from the protocol package.

## Milestones

### Milestone 0 — Adapter spike and capability matrix (timebox: one day)

This milestone used an additive, isolated temporary script to spawn the `claude-agent-acp` adapter against a throwaway real worktree and walk the protocol. It recorded, in the capability matrix below, the bin entry point; `initialize` capabilities; `session/new`; `session/prompt` update variants; permission shape; question behavior; plan mode; mode/config selection; list/load; cancellation; and crash behavior. Authentication required zero configuration (D9). Once D14 and the matrix captured those findings, the script was removed instead of becoming an unmaintained compatibility tool.

Verify before proceeding: the matrix covers every row above with observed evidence (transcript snippets), and no gap is fatal to Milestones 1–4.

#### Capability matrix (observed 2026-07-09, adapter 0.56.0, client sdk 1.2.0, spike run `acp-spike/run1`)

| Capability | Observed |
|---|---|
| Bin entry | `claude-agent-acp` → `dist/index.js`, `#!/usr/bin/env node`, engines node ≥22. Spawned as `node <resolved dist/index.js>`; stdio ACP works first try. |
| Auth | Zero config — inherited the host login from the environment; `authMethods: []` in initialize (nothing to authenticate). Confirms D9. |
| `initialize` | `protocolVersion: 1`; caps: `loadSession: true`; `sessionCapabilities: { list, fork, resume, close, delete, additionalDirectories }`; `promptCapabilities: { image: true, embeddedContext: true }`; `mcpCapabilities: { http: true, sse: true }`; `_meta.claudeCode.promptQueueing: true` (adapter queues prompts sent mid-turn). No `providers` capability → `providers/list` not applicable. |
| `session/new` | Returns `sessionId` + `modes` + `configOptions`. **Default mode is `bypassPermissions`** — every tool call auto-approved, `session/request_permission` never fires (adapter stderr even warns about it). Manager must set a safer mode at creation (D14-c). |
| Update variants seen | 9 of 13 across 5 turns: `user_message_chunk`, `agent_message_chunk`, `tool_call`, `tool_call_update`, `usage_update` (with cumulative `cost` on final one), `current_mode_update`, `config_option_update`, `available_commands_update`, `session_info_update`. Not observed: `agent_thought_chunk` (no extended thinking triggered), `plan`/`plan_update`/`plan_removed` (no TodoWrite-style turn exercised). Tool calls carry rich `_meta.claudeCode` (toolName, raw toolResponse). |
| `session/request_permission` | Fires in `default` mode. `toolCall` is fully renderable: `kind` (`edit`/`execute`/`switch_mode`/…), `title`, `content` (structured `diff` with `oldText`/`newText` for edits, text for commands), `locations`, `rawInput`. `options` carry `optionId`/`name`/`kind` (`allow_always`/`allow_once`/`reject_once`) — e.g. Bash: Always-Allow-this-command / Allow / Reject. |
| AskUserQuestion | Adapter 0.56.0 contains an ACP form-elicitation bridge, but the spike client omitted `elicitation.form`; the adapter therefore disabled the tool and the model asked in plain text. *Since closed:* the host now advertises the capability and handles `elicitation/create` as pending-question cards (D14-a → D22), verified end-to-end on the phone. |
| Plan mode / ExitPlanMode | Fully supported: `session/set_mode {modeId:"plan"}` → `{}` + `current_mode_update`; plan exit surfaces as `session/request_permission` with `toolCall.kind: "switch_mode"` ("Ready to code?"), plan markdown in `content`, and the target permission modes as options (`bypassPermissions`/`auto`/`acceptEdits`/`default` to accept; `plan` to keep planning). |
| Modes | `auto` (classifier-approved), `default` (manual), `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`. Mirrored as the `mode` config option. |
| Model selection | **Supported** via `session/set_config_option`: `configOptions` = `mode`, `model` (select: `default`/`opus`/`fable`/`sonnet`/`haiku`), `effort` (select: `default`/`low`/`medium`/`high`/`xhigh`/`max`). Set returns the full refreshed `configOptions` and emits `config_option_update`. |
| `session/list` | Works, returns `{sessionId, cwd, title, updatedAt}` per session; **persists across adapter processes** (fresh process listed the session created by the previous one — backed by Claude's on-disk session store). |
| `session/load` | Works from a fresh adapter process: replays the full timeline as ordinary `session/update` notifications (our run: 30 events — `user_message_chunk` 6, `agent_message_chunk` 4, `tool_call` 10, `tool_call_update` 10) before the response resolves; response carries current `modes`+`configOptions`; session fully usable afterwards (follow-up prompt → `end_turn`). |
| `session/cancel` | Notification; in-flight `session/prompt` resolves with `stopReason: "cancelled"` — ack in ~13ms in the spike. |
| Crash mid-turn | SIGKILL on the adapter → pending `session/prompt` rejects `"ACP connection closed"` and the `connectWith` scope unwinds with the same error. Clean, immediate detection for marking a session `dead`. |
| Stop reasons | `end_turn` on all normal turns; `cancelled` on cancel. |

Two client-sdk packaging facts confirmed while spiking (they shape Milestone 1): the sdk's generated **zod schemas are not importable** — `dist/schema/zod.gen.js` exists but the package `exports` map only exposes `.`, `./experimental/*`, and `./schema/schema.json`, so deep imports fail in both node and bun (`ERR_PACKAGE_PATH_NOT_EXPORTED`) and nothing zod-ish is re-exported from the root. And the modern client API is the `client({name}).onRequest(...).onNotification(...).connectWith(ndJsonStream(...), op)` builder; `ClientSideConnection` is deprecated.

### Milestone 1 — `packages/session-protocol`

The package as specified — including the `./react` hooks — with unit tests for envelope folding, cursor encoding, the stream client's gap/reset logic, and hook folding behavior (`bun test packages/session-protocol`). Acceptance: `bun run typecheck` green across the repo; adding the package to `apps/mobile` keeps `bun run --cwd apps/mobile typecheck` green (proves RN type-safety with zero node or react-dom leakage).

### Milestone 2 — `AcpSessionManager` + `acpSessions` router

Sessions work end-to-end without any streaming: create → prompt → poll `get`/`getMessages` shows the folded turn; a Bash approval blocks the turn, `respondToPermission` unblocks it; two rapid `respondToPermission` calls produce one success and one `ALREADY_RESOLVED`; `list` shows live sessions only (kill the adapter process manually → session disappears from `list`, `get` reports `dead`). Acceptance: integration test with a temp worktree plus the manual transcript below. The mastra `chat` router is untouched (diff shows zero changes under `runtime/chat/` and `router/chat/`).

### Milestone 3 — WS stream + subscribe helper

The journal, the WS route, `since` replay, `reset` resync, and `subscribeToSession`. Acceptance: two concurrent subscribers receive identical seq-ordered envelopes during a live turn; disconnect one for 10 seconds mid-turn, reconnect with its last seq → no gaps, no duplicates after client dedup; reconnect with `since=1` after forcing journal eviction (set ring size to 10 in the test) → `reset` followed by successful resync; the WS route functions through a locally-run relay (dev setup per `apps/mobile/plans/mobile-chat-runtime.md` §Verification).

### Milestone 4 — Mobile surface

The hooks wired into screens, thread rendering, permission sheet, and (per D15) optional creation flow — all parallel to the existing mastra chat screens. Acceptance on device against a dev host through the relay: live token streaming (no 250ms polling cadence), a permission answered from mobile, a second client (desktop dev tools or a script) attached simultaneously seeing the same stream, and the mobile UI surviving a `reset` resync without visible corruption. `bun run lint` exit 0, `bun run typecheck` green, `bun test` green.

## Concrete Steps

Milestone-2 smoke transcript (repo root; dev host-service on its default port):

```bash
bun run --cwd packages/host-service dev

# second shell:
curl -s localhost:4879/trpc/acpSessions.create -H 'content-type: application/json' \
  -d '{"json":{"sessionId":"<uuid>","workspaceId":"<workspace-uuid>"}}'
# Expected: {"result":{"data":{"json":{"sessionId":"...","status":"idle","harness":"claude-agent-acp",...}}}}

curl -s localhost:4879/trpc/acpSessions.prompt -H 'content-type: application/json' \
  -d '{"json":{"sessionId":"<uuid>","prompt":[{"type":"text","text":"list the files in this repo"}]}}'
# Expected immediately: {"result":{"data":{"json":{"accepted":true}}}}
# Turn completion and stop reason arrive on journaled state frames.

curl -s "localhost:4879/trpc/acpSessions.getMessages?input=<url-encoded {\"json\":{\"sessionId\":\"<uuid>\"}}>"
# Expected: envelopes containing agent_message_chunk / tool_call frames from the turn
```

Milestone-3 stream check (any WS client, e.g. `bun x wscat`):

```bash
wscat -c "ws://localhost:4879/acp-sessions/<uuid>/stream?since=0"
# Expected: {"seq":1,...,"frame":{"kind":"state",...}} then live update frames during a prompt
```

Validation at every milestone:

```bash
bun run typecheck   # all packages, no errors
bun run lint        # exit 0 — CI treats warnings as failures
bun test            # all tests pass
```

## Validation and Acceptance

End-to-end acceptance for the plan is the Purpose scenario: mobile attached through the relay to a host-owned ACP session, live streaming, permissions answerable from any attached client, dead sessions vanishing from the list. Mastra regression gate: the existing desktop chat flow must be demonstrably unaffected — run a normal mastra chat in `bun dev` desktop after Milestone 4 and confirm identical behavior, and confirm `git diff` touches nothing under `packages/chat/`, `packages/host-service/src/runtime/chat/`, or `packages/host-service/src/trpc/router/chat/`.

## Idempotence and Recovery

Everything is additive; rollback at any milestone is deleting new files. `create` is idempotent per sessionId (returns existing live state). `respondToPermission` is exactly-once with a typed duplicate error. Stream reconnects are safe at any cursor; the reset path is the universal repair. Adapter crashes degrade to `dead` status without affecting other sessions or the host-service process (the stdio connection failure is contained per `ManagedAcpSession`).

## Interfaces and Dependencies

- `@agentclientprotocol/claude-agent-acp` (exact-pinned; 0.58.1 at time of writing) — host-service only, runtime dep, one child process per session. Supersedes `@zed-industries/claude-code-acp`, which is not used.
- `@agentclientprotocol/sdk` `^1.2.x` — types + stdio client connection; dep of `packages/session-protocol` (full type re-export; the sdk's zod is unexportable, D14-b) and `packages/host-service` (connection machinery only — never named types; see D7).
- `packages/session-protocol` — the sole source of ACP typing for **both sides**: mobile and host-service alike import the entire contract from here (D7). Also ships the `./client` transport helper and `./react` hooks (D16; peer dep `react` only).
- Host-service gains one router namespace (`acpSessions`) and one WS route (`/acp-sessions/:id/stream`). Nothing in `packages/trpc` (cloud), `apps/relay`, or any mastra path changes.
- Ecosystem watch list (not dependencies): `use-acp` (adopt-or-align if it reaches protocol v1 without the react-dom peer), `@mcpc-tech/acp-ai-provider` (AI SDK bridge; interesting later for exposing host sessions as AI SDK models server-side).
- Future (out of scope, recorded for orientation): the desktop hard-swap plan replaces mastra consumers with this surface — the `./react` hooks are the intended integration point; Codex arrives as `@agentclientprotocol/codex-acp` behind the same manager with `harness: "codex-acp"`.

---

Revision note (2026-07-09, initial): drafted around a custom session-protocol carrying Claude Agent SDK events verbatim, full mastra excision in scope. That design now lives on as the competing alternative in `plans/session-harness-claude-agent-sdk.md`.

Revision note (2026-07-09, rev 2): rewritten after Kirill's second decision round. Scope cut to a parallel runtime (mastra untouched, prod safety) with host + mobile surfaces only; processes keep-alive forever; live-sessions-only (no SQLite registry, no transcript reads, no resume); auth = host machine's Claude login. Protocol switched from custom Claude-SDK envelope to ACP v1 via an off-the-shelf adapter (D13) after evaluating `@agentclientprotocol/sdk@1.2.1` — upstream types + zod eliminate nearly all authored protocol types. Code blocks converted to fenced style for markdown preview rendering.

Revision note (2026-07-09, rev 3): D7 amended — session-protocol re-exports the *entire* ACP type surface (no curated list), and both host-service and mobile import ACP typing exclusively through it, per Kirill's "import the typing entirely on both sides".

Revision note (2026-07-09, rev 4): renamed from the timestamped filename to `session-harness-acp.md` and cross-linked with the restored competing plan. Adapter swapped from Zed's `@zed-industries/claude-code-acp` (stale: protocol sdk 0.14.1, agent sdk 0.2.44, frozen since March) to the official `@agentclientprotocol/claude-agent-acp@0.58.1` (current pins on both sdks, actively released) — D13 amended; the stale-pin risk that shadowed the adapter choice is gone. Added D16 after surveying ACP client libraries per Kirill's pointer to `use-acp` and wish for something mainstream like the Vercel AI SDK: `use-acp` is the right API shape but pre-v1-protocol and react-dom-bound; the AI SDK's community ACP provider is server-side and process-owning (wrong topology). We ship our own `./react` hooks modeled on `use-acp`, keeping both libraries on a watch list.

Revision note (2026-07-10, rev 5): v1 complete. M4 recorded with tap-driven evidence; D21 (prompt = admission ack, forced by the relay's 30s buffered-HTTP window) and D22 (native AskUserQuestion via `elicitation.form` + `elicitation/create`, rendered through the existing pending-permission cards; supersedes a same-day MCP-bridge detour and revises D8's dedicated-shape requirement) added; D14-a closed; the setConfigOption response-carries-the-update host fix, capability-gate discovery, and sim-driving gotchas recorded in Surprises; comparison table and capability matrix updated to implemented status; Outcomes & Retrospective written.
