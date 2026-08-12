# Chat v3 — Ship Plan

**Status:** draft for review. Executes `plans/chat-protocol-v1.md` + `plans/chat-harness-adapters.md`; context in `plans/chat-ui-greenfield-research.md`. **Supersedes `plans/v2-chat-greenfield-architecture.md`** (which prescribed keeping mastracode and AI SDK `UIMessage` — both overturned; move it to `plans/done/` as superseded when this merges).

**Scope decisions:**
- Desktop ships first: a **new chat pane that replaces the v2 `ChatPane`** at the pane registry. Old pane code is deleted at flag-flip, not kept as a fallback.
- The v1 window's chat pane is untouched — it dies with v1, out of scope here.
- Dual harness at launch: Claude (Agent SDK) + Codex (app-server), harness picker in the pane from day one.
- Mobile is a follow-on phase on the same spine (gated on the RN markdown spike); mastra/ACP stacks stay alive until mobile ports, then retire.
- Package naming: the new package owns the canonical **`packages/chat`** (`@superset/chat`); the old mastra-era package was renamed **`packages/chat-legacy`** (`@superset/chat-legacy`) and is deleted when Stack A retires.

---

## 1. Workstream A — `packages/chat` (client-safe, no Node/DOM/RN deps outside declared entries)

```
packages/chat/
  package.json                 # exports: ./protocol ./core ./client ./react
  src/
    protocol/
      cursor.ts                # Cursor {epoch, seq}; compare/serialize; zod
      items.ts                 # Item union (7 kinds) + ToolContent + Decision — zod schemas, inferred types
      envelope.ts              # Envelope / DurableEvent / Delta / Reset — zod
      commands.ts              # command input schemas (prompt, steer, respondToApproval, ...) with commandId
      index.ts
    core/
      reducer/
        reducer.ts             # (SessionSnapshot, Envelope) -> SessionSnapshot. Pure. THE reducer (live + replay).
        reducer.test.ts        # property tests: arrival order, duplication, loss, epoch reset, never-shrink
      timeline/
        deriveTimeline.ts      # SessionSnapshot -> TimelineEntry[] (sorted, grouped by turn)
        collapseWorkLog.ts     # tool-lifecycle runs -> single collapsible entries
        derivePendingApprovals.ts  # incl. stale handling
        deriveTimeline.test.ts
      markdown/
        splitBlocks.ts         # mdast-offset block splitter; byte-identical stable slices
        fenceState.ts          # open-fence detection -> highlighter gating signal
        splitBlocks.test.ts
      outbox/
        outbox.ts              # queued sends, commandId minting, clientId reconciliation, retry policy
        outbox.test.ts
      coalesce.ts              # scheduler-injected write batching (rAF on web, RN equivalent injected)
    client/
      subscribeToSession.ts    # reconnecting WS client: since-cursor, delta channel declaration,
                               # gap/reset handling, epoch change -> refetch. WebSocket impl injected.
      sessionClient.ts         # commands via injected tRPC caller + subscription; one object per session
    react/
      useChatSession/
        useChatSession.ts      # seed (getSession+getItems) -> reducer -> live tail; loadOlder pagination
        useChatSession.test.ts
      useTimeline/useTimeline.ts     # memoized deriveTimeline over snapshot
      useApprovals/useApprovals.ts
```

Key interfaces (authored in `protocol/`/`core/`, imported everywhere else):

```ts
// core/reducer
type SessionSnapshot = {
  session: SessionState;
  turns: Map<string, Turn>;
  items: Map<string, Item>;          // flat; order = (turn order, startedAtMs, id)
  liveText: Map<string, string>;     // delta-accumulated tails, superseded by snapshots
  cursor: Cursor | null;
};
function reduce(prev: SessionSnapshot, env: Envelope): SessionSnapshot;

// client
type SessionClient = {
  subscribe(opts: { since?: Cursor; deltas: DeltaChannel[] }): AsyncIterable<Envelope>;
  send<C extends Command>(command: C): Promise<CommandResult<C>>;
  getItems(opts: { before?: Cursor; limit: number }): Promise<{ events: DurableEvent[]; cursor: Cursor }>;
};
```

Lint guards (CI): `protocol/` imports zod only; `core/` imports `protocol/` + stdlib only; `react/` is the only entry importing react; nothing imports react-dom/react-native/node builtins.

## 2. Workstream B — host runtime (**AMENDED 2026-08-04:** now standalone `packages/chat-runtime`, owning its own `chat.db` — never host.db; exports `createChatRuntime({ dataDir })` plus, later, a mountable tRPC router + WS handler that host-service mounts in a few lines. Paths below map from `host-service/src/runtime/chat/` → `chat-runtime/src/`; the db/ section's host.db tables become CREATE-IF-NOT-EXISTS bootstrap in the package's own file.)

```
packages/host-service/src/runtime/chat/
  db/
    schema.ts                  # host.db tables:
                               #   chat_journal(session_id, epoch, seq, ts, event_json)  PK(session_id, epoch, seq)
                               #   chat_sessions_local(session_id PK, workspace_id, harness, harness_session_id,
                               #     epoch, status, title, queued_count, updated_at)     -- the projection/read model
    migrations note            # additive; journal caps: terminal content snapshots ≤256KB/item (truncated flag),
                               # journal size cap per session with oldest-turn compaction -> notice(compaction)
  journal/
    journal.ts                 # append(sessionId, DurableEvent) -> Cursor  (assigns seq; same-tx projection update)
    replay.ts                  # readSince(sessionId, cursor) / readPage(before, limit)
    epoch.ts                   # epoch mint on create/journal-loss; NOT on process restart
    journal.test.ts
  stream/
    wsHandler.ts               # GET /chat-sessions/:id/stream?since&deltas= ; registered in app.ts beside /acp-sessions
    fanout.ts                  # per-session subscriber set; per-subscriber delta filter; coalesce to ≤30fps
    backpressure.ts            # slow-consumer policy: drop deltas first, then disconnect w/ reset(journal_missing? no: slow_consumer -> reconnect replays spine)
  sessions/
    registry.ts                # lifecycle: create/resume/idle-unload/dispose; resurrect -> interrupt running turn,
                               # cancel running tool_calls, stale pending approvals (protocol §9.5b)
    commandDedupe.ts           # commandId LRU
    promptQueue.ts             # FIFO prompt-while-running (protocol §7); queued flag on user_message
  harness/
    types.ts                   # HarnessAdapter + AdapterEvent (from chat-harness-adapters.md §2)
    fake/fakeHarness.ts        # scripted harness driving all runtime tests; also powers Storybook fixtures
    claude/
      claudeAdapter.ts         # @anthropic-ai/claude-agent-sdk (pinned exact), includePartialMessages,
                               # canUseTool -> approval_request; resume via harness_session_id
      mapToolUse.ts            # ported claude-code-acp table: name -> {toolKind, title, content}
      mapToolUse.test.ts
      fixtures/*.jsonl         # RECORDED wire streams (M0 spike output), not hand-written
    codex/
      rpcClient.ts             # JSON-RPC over stdio to `codex app-server`; initialize handshake,
                               # min-version gate, capability detection
      codexAdapter.ts          # ThreadItem -> Item (near-1:1); server-initiated approval requests -> approval_request
      fixtures/*.jsonl
```

tRPC (mounted in `packages/host-service/src/trpc/router/router.ts` beside existing routers):

```
trpc/router/chat-v3/chat-v3.ts   # createSession, prompt, steer, cancelTurn, respondToApproval,
                                 # setMode/setModel/setConfigOption, listSessions, getSession, getItems
                                 # all inputs = @superset/chat protocol/commands schemas; OUTPUT schemas too (parse both ways)
```

Cloud metadata: `createSession` writes the `chat_sessions` row via the **tRPC path only** (`apiTrpcClient.chat.createSession`); the REST PUT path is not used by this stack.

Import boundary (CI-enforced): `runtime/chat/**` imports only `@superset/chat/protocol`, vendor SDKs, `db/` glue, and itself — never host-service workspace/git/terminal modules. This keeps the future `packages/chat-runtime` extraction a `git mv`.

## 3. Workstream C — desktop pane (`apps/desktop`)

New pane, co-located per AGENTS.md, registered as pane kind `"chat"`:

```
.../v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatV3Pane/
  ChatV3Pane.tsx               # shell: session picker + transcript + composer; owns SessionClient wiring
  index.ts
  hooks/
    useSessionClient/          # workspaceTrpc caller + WS (host URL from WorkspaceProvider, relay-tunnel aware)
  components/
    Transcript/
      Transcript.tsx           # non-virtualized v1: content-visibility:auto + contain-intrinsic-size;
                               # anchor-user-turn scroll (align:'start' + reserved space; zero scroll writes
                               # during streaming; approval rows force scroll-into-view)
      components/
        TurnGroup/             # turn boundary, collapse state (auto-expand once on pending approval;
                               #   user-collapsed never reopens; expand-all escape hatch)
        UserMessageRow/  AgentMessageRow/  ReasoningRow/
        ToolCallRow/           # dispatch on toolKind; status chip incl. declined/canceled; duration
          components/ DiffContent/  TerminalContent/  TextContent/
        PlanRow/  ApprovalRow/  NoticeRow/  UnknownItemRow/   # UnknownItemRow = open-union fallback
    MarkdownView/
      MarkdownView.tsx         # per-block memoized renderer over core/markdown splitBlocks;
                               # plain <pre> while fence open, Shiki after close; frozen for settled items
    Composer/
      Composer.tsx             # v1: plain textarea + mention/slash popovers producing TextElement byte ranges
                               # (Tiptap port deferred; drafts: 300ms-debounced persist + flush-on-unload;
                               #  clear ONLY on user_message echo w/ matching clientId)
      components/ SlashPopover/  MentionPopover/  QueuedBadge/
    SessionHeader/             # harness picker (claude|codex), model/mode, status incl. awaiting_input
    SessionPicker/             # TanStack DB useLiveQuery over chat_sessions (cache-first per AGENTS rule 9)
                               #   merged with host listSessions for liveness
```

**Codex desktop teardown adoptions (2026-08-04; from the shipped app — Electron 42 + React 19 + Tailwind v4, validating our stack):** (1) virtualize by **turn**, not message — layout stored as `distanceFromBottom` + per-turn heights so appends are no-ops; scroll compensation applies only to turns between viewport and bottom; (2) two-tier `content-visibility: auto` + `contain-intrinsic-size: auto 240px` (36px for diff rows) with `:has()` escape hatches for expanded widgets; (3) **re-pace** agent text: rAF queue, ~24 chars/frame, bounded force-drain — constant reveal regardless of network burstiness; exec output on a 50ms queue tail-truncated to last 20k chars; (4) at-bottom check: 24px tolerance normally, 0px while content is pending; (5) in-transcript find via CSS Custom Highlight API (no DOM mutation — survives streaming + virtualization); (6) sync IPC bootstrap + theme class set pre-React (no flash), and a tiny generic bridge redispatching IPC as DOM MessageEvents so renderer code stays web-portable; (7) persisted per-thread scroll restoration ({anchorKey, turnHeights}); (8) they gate durable-vs-ephemeral notifications with a static method→boolean map — our spine/delta split, confirmed shipped. Their code extracts live only in the session scratchpad — never commit any of it.

**Component reuse policy:** the pane's *skin* comes from the existing vendored `@superset/ui/ai-elements` presentational components (`message`/`response` shells, `tool` collapsible, `reasoning`, `code-block`, `task`, `shimmer`) mapped onto our timeline entries — they're external copy-in components, not the deprecated internal chat logic, and they keep the pane visually consistent for free. Four things are **never** reused from that set, per research findings: the data shapes (`UIMessage` must not reappear as an interchange format), whole-message markdown rendering (`MessageResponse` has a broken memo comparator; our per-block `MarkdownView` is the perf recipe — streamdown is acceptable only as the per-block renderer if the M0 #473 check passes), `Conversation`/`use-stick-to-bottom` (bottom-chasing scroll — our anchor-user-turn `Transcript` stands), and `PromptInput` internals (no mention/slash support; visual shell only). Same skin-only rule applies to the RN ai-elements set in the mobile phase.

**Registry swap & deletion:** `usePaneRegistry.tsx` pane kind `"chat"` points at `ChatV3Pane` behind `chat_v3` flag; at flag-flip the old subtree is deleted in the same PR: old `ChatPane/`, `useWorkspaceChatDisplay.ts` (4fps poller), `ToolCallBlock.tsx` + ~25 per-tool renderers, `prompt-input.tsx` (1569 lines), fake-stream `StreamingMessageText`, and the already-dead `MessageList/`, `MessagePartsRenderer/`, `PlanBlock/`, `SlashCommandInput/`. Grep gate in the PR: zero remaining imports of `chatService`/`chat.getSnapshot` from the v2 route tree.

**Parity checklist (gates old-pane deletion)** — send/stream/interrupt; tool rendering incl. diffs+terminal; approvals (incl. options); plan; slash commands (host RPC registry, existing endpoints); file mentions; model+mode selection; session create/switch/list; attachments (via existing `uploadAttachment` → `attachment` UserContent). **Deliberately dropped** (v1→v3 misfit rule): MCP overview pane hook-in, question-vs-approval distinction (folded into approvals), fake typewriter animation.

## 4. Milestones

| # | Deliverable | Exit criteria | Est. |
|---|---|---|---|
| M0 | Spikes (parallel with M1): record real Claude SDK fixture streams; codex app-server probe + min-version; relay WS soak (N subscribers, cellular reconnect, iOS background/resume); streamdown#473 check → pick desktop markdown renderer | Fixtures committed; go/no-go notes appended to this doc | 3–4d |
| M1 | `@superset/chat` `protocol/` + `core/` + host `journal/` + `fake/` harness | Reducer property tests + journal tests green; fake-harness golden transcript folds identically via live vs replay | 4d |
| M2 | `stream/` + `sessions/` + tRPC router | Headless node client E2E: subscribe→prompt(fake)→reconnect mid-turn with since-cursor → identical final snapshot; epoch-reset path covered | 3d |
| M3 | Claude adapter | All recorded fixtures map + fold green; live smoke: real prompt→approval→decline→continue on a dev host | 4–5d |
| M4 | Codex adapter (parallel from M2) | Same bar as M3 + min-version gate error path | 4–5d |
| M5 | `ChatV3Pane` behind `chat_v3` flag (internal builds), skinned with existing ai-elements per reuse policy | CDP E2E per AGENTS CDP rules: real user journey send→stream→approve→diff render, before/after screenshots; perf gate: 10k-line transcript scroll + stream ≤1 commit/frame | 4–5d |
| M6 | Flag flip + old-pane deletion PR | Parity checklist signed off; grep gate zero; dogfood week clean | 2d + soak |

Serial worst case ~4 weeks; with adapter parallelization (M3/M4 concurrent) ~3 weeks to M5.

## 5. Testing strategy

- **Golden transcripts** are the backbone: recorded harness streams → adapter → journal → reducer → derived timeline, snapshot-asserted at each stage. Same fixtures power Storybook stories for every row component via the fake harness.
- **Reducer property tests**: shuffle/duplicate/drop envelope sequences must converge; replay(journal) === live fold; transcript never shrinks.
- **Headless E2E** (M2) runs in CI; **CDP E2E** (M5) follows the AGENTS.md evidence-gate rules (real journey, screenshots, no synthetic-only claims).
- Lint boundaries from §1/§2 run in CI. `bun run lint` + `typecheck` green before every push (repo rule).

**Workstream B build notes (2026-08-04):** `packages/chat-runtime` landed (29 tests). Two facts to preserve: (1) better-sqlite3 in the bun store is compiled for Electron's ABI, so tests inject `bun:sqlite` through the `SqliteDatabase` seam — both drivers satisfy the interface structurally with zero casts, but the better-sqlite3 path is verified by types + host-service parity, not test execution; exercise it in the M5 CDP pass. (2) Boundary rule for the mount: **host passes resolved facts, never concepts** — runtime receives opaque `workspaceId` + resolved `cwd`/env, never imports workspace logic; host.db never grows a chat table. Also: `host-service/src/runtime/chat/` is occupied by legacy mastra code — the mount lives elsewhere or that subtree renames at flag-flip.

## 6. Risks & mitigations (carried from pre-flight review)

1. Claude/Codex mapping built partly from types, not wire — M0 fixtures are the antidote; no adapter code before its fixtures exist.
2. Codex field version skew — min-version gate + capability detection; "upgrade codex" is a designed UI state, not an error toast.
3. Relay backpressure/fan-out unknowns — M0 soak; delta-drop-first policy means worst case degrades to spine-only (still correct).
4. Streaming markdown perf — frozen-history + per-block memoization + fence gating are all in from day one; virtualization is a deliberate later escalation (`@tanstack/react-virtual` `anchorTo:'end'`, pinned exact) with the seam already in `Transcript`.
5. Old-pane deletion breaking hidden consumers — grep gate + the parity checklist; v1 window untouched.
6. Scope creep toward mobile — explicitly out; the spine and `@superset/chat` are mobile-ready by construction (no DOM in core/client), which is the whole insurance.
