# Open Technical Sub-Decisions

Deferred to sprint planning — `/kb-sprint-plan` should slot these into specific sprints:

1. **JWT lifecycle for mobile → relay**: per-call mint via cloud tRPC vs device-held longer-lived host token vs server-side proxy. Trade-off: security boundary vs latency vs offline UX.
2. **Live streaming transport**: SSE through relay (requires extending `apps/relay`'s WS tunnel to proxy `text/event-stream`) vs chunked HTTP through relay vs cloud DurableStreams SSE (existing path at `/api/chat/[sessionId]/stream`). Mobile-chat v2 may ship with periodic `chat.getSnapshot` polling and defer streaming to a follow-up mobile-chat PRD.
3. **Markdown library choice**: `react-native-markdown-display` (widely-used, opinionated styling) vs `@expensify/react-native-live-markdown` (faster but newer/less battle-tested) vs custom thin wrapper. Benchmarks needed.
4. **Tiptap WebView perf on mid-range Android**: validate that `@10play/tentap-editor` keyboard handling + input latency are acceptable on Android 11+ devices with 4GB RAM. Define a perf budget before locking in.
5. **Snapshot polling interval (if streaming deferred)**: 250ms? 500ms? 1s? Battery vs latency vs server load.
6. ~~**Host selection and workspace→host resolution**~~ — **RESOLVED in v1.6.0** by the NAV functional group (see `../09-uc-nav.md`). Decision summary:
   - **One host at a time**, Slack-style. Header chip on the sessions list shows the currently-selected host; tapping opens a `@gorhom/bottom-sheet` listing all hosts the user has access to via `v2_users_hosts` joined to `v2_hosts`.
   - **`hostId` is resolved from `v2_workspaces.hostId`** (the FK already present in the schema), not via a cloud lookup. The mobile `chat_sessions` and `v2_workspaces` Electric collections both carry `hostId` on each row; the sessions list scopes by `selectedHostId` on the client.
   - **Offline hosts remain selectable**; selecting one triggers the existing UC-PLATF-03 host-offline banner on the sessions list and disables Send. No automatic "pick another online host" — the user makes that choice explicitly via the picker.
   - **Selected host persisted locally** in `expo-secure-store` keyed by `userId + organizationId`. First-launch default: the host with the most-recent activity for this user.
   - **Push-notification deep-links** (UC-NAV-05) silently align the selected host to match the session's host before mounting the chat view so back-navigation lands in a consistent sessions list.
   See UC-NAV-03 for full ACs and the canonical bottom-sheet wireframe.
