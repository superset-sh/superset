# Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          apps/mobile (Expo)                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              apps/mobile/components/chat/                    │    │
│  │  ChatInterface → MessageList → UserMessage/AssistantMessage  │    │
│  │  ChatInputFooter (@10play/tentap-editor)                     │    │
│  │  PendingApprovalCard (inline) + PendingApprovalFooter (sticky)│   │
│  │  PendingQuestionSheet (@gorhom/bottom-sheet)                 │    │
│  │  PlanReviewScreen (expo-router pushed route)                 │    │
│  │  PendingActionIndicator (floating pill)                      │    │
│  │  (FlashList, Reanimated)                                     │    │
│  └────────────────────┬────────────────────────────┬────────────┘    │
│                       │                            │                 │
│  ┌────────────────────▼──────────────┐  ┌──────────▼─────────┐       │
│  │  apps/mobile/lib/host-service-    │  │  Electric          │       │
│  │  client.ts (httpLink, JWT)        │  │  collections       │       │
│  │  HTTP adaptation of host-service  │  │  (existing +       │       │
│  │  AppRouter (desktop uses IPC)     │  │  chat_sessions)    │       │
│  └────────────────────┬──────────────┘  └──────────┬─────────┘       │
│                       │                            │                 │
│  ┌────────────────────▼──────────────┐             │                 │
│  │  Push notifications (Expo push)   │             │                 │
│  └─────────────────┬─────────────────┘             │                 │
└────────────────────┼──────────────────────────────┼──────────────────┘
                     │                              │
                     │ HTTPS                        │ SSE (Shape proto)
                     ▼                              │
        ┌────────────────────────┐                  │
        │       apps/relay       │                  │
        │  (Hono + Redis + JWT)  │                  │
        │  per-host WS tunnel    │                  │
        └────────────┬───────────┘                  │
                     │ tunnel-forwarded HTTP        │
                     ▼                              ▼
        ┌────────────────────────┐    ┌─────────────────────────┐
        │  packages/host-service │    │  apps/electric-proxy    │
        │  (Hono + tRPC)         │    │  (Cloudflare Worker)    │
        │                        │    │                         │
        │  • chat router:        │    │  • chat_sessions shape  │
        │    sendMessage,        │    │    (where.ts:136-137)   │
        │    listMessages,       │    │                         │
        │    respondToApproval,  │    │                         │
        │    respondToQuestion,  │    │                         │
        │    respondToPlan, etc. │    │                         │
        │  • Mastra harness      │    │                         │
        │  • In-memory message   │    │                         │
        │    store               │    │                         │
        └────────────────────────┘    └─────────┬───────────────┘
                     │                          │
                     │ Fire-and-forget          │
                     │ chat.updateSession       │
                     │ (lastActiveAt)           │
                     ▼                          ▼
        ┌──────────────────────────────────────────────────────┐
        │           Neon Postgres (chat_sessions)              │
        │  metadata only: title, lastActiveAt, workspace, org  │
        └──────────────────────────────────────────────────────┘
```
