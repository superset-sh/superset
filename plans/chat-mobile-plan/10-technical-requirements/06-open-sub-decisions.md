# Open Technical Sub-Decisions

Deferred to sprint planning — `/kb-sprint-plan` should slot these into specific sprints:

1. **JWT lifecycle for mobile → relay**: per-call mint via cloud tRPC vs device-held longer-lived host token vs server-side proxy. Trade-off: security boundary vs latency vs offline UX.
2. **Live streaming transport**: SSE through relay (requires extending `apps/relay`'s WS tunnel to proxy `text/event-stream`) vs chunked HTTP through relay vs cloud DurableStreams SSE (existing path at `/api/chat/[sessionId]/stream`). Mobile-chat v2 may ship with periodic `chat.getSnapshot` polling and defer streaming to a follow-up mobile-chat PRD.
3. **Markdown library choice**: `react-native-markdown-display` (widely-used, opinionated styling) vs `@expensify/react-native-live-markdown` (faster but newer/less battle-tested) vs custom thin wrapper. Benchmarks needed.
4. **Tiptap WebView perf on mid-range Android**: validate that `@10play/tentap-editor` keyboard handling + input latency are acceptable on Android 11+ devices with 4GB RAM. Define a perf budget before locking in.
5. **Snapshot polling interval (if streaming deferred)**: 250ms? 500ms? 1s? Battery vs latency vs server load.
6. **Host selection and workspace→host resolution**: mobile cannot initiate or resume a chat session without knowing which host to route through. Desktop resolves this via its multi-pane workspace view (each pane bound to a workspace+host). Mobile needs: (a) how to resolve `hostId` from `v2WorkspaceId` (cloud tRPC lookup? relay directory? cached mapping?), (b) whether mobile shows a host picker when multiple hosts are available for a workspace, (c) what happens when the host a session belongs to is offline but another host is online. This decision blocks UC-SESS and UC-COMP transport wiring.
