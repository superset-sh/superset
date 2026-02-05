# Durable Streams Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│  Clients (packages/ai-chat)                             │
│                                                         │
│  ┌─────────────────────────┐  ┌───────────────────────┐ │
│  │ @durable-streams/client │  │ @durable-streams/state│ │
│  │                         │  │                       │ │
│  │  DurableStream          │  │  State Protocol       │ │
│  │    .create(url)         │  │    │                  │ │
│  │    .append(data)        │  │    ▼ TanStack DB      │ │
│  │    .read(offset?)       │  │  Reactive Collections │ │
│  │    .subscribe(cb)       │  │                       │ │
│  └────────────┬────────────┘  └───────────┬───────────┘ │
└───────────────┼───────────────────────────┼─────────────┘
                │ HTTP + SSE                │ HTTP + SSE
                ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│  Server (apps/streams)                                  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ @durable-streams/server                           │  │
│  │                                                   │  │
│  │  DurableStreamTestServer (port, host, dataDir)    │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ HTTP Protocol                               │  │  │
│  │  │                                             │  │  │
│  │  │  PUT    /streams/:id  ─ Create stream       │  │  │
│  │  │  POST   /streams/:id  ─ Append data         │  │  │
│  │  │  GET    /streams/:id  ─ Read / SSE          │  │  │
│  │  │  HEAD   /streams/:id  ─ Metadata            │  │  │
│  │  │  DELETE /streams/:id  ─ Delete               │  │  │
│  │  └──────────────────┬──────────────────────────┘  │  │
│  │                     │                             │  │
│  │                     ▼                             │  │
│  │           FileBackedStreamStore                   │  │
│  └─────────────────────┬─────────────────────────────┘  │
└────────────────────────┼────────────────────────────────┘
                    ┌────┴─────┐
                    ▼          ▼
┌─────────────────────────────────────────────────────────┐
│  Storage (./data)                                       │
│                                                         │
│  ┌──────────────────┐    ┌────────────────────────────┐ │
│  │ LMDB             │    │ Append-Only Logs           │ │
│  │ Metadata Index    │    │ Stream Data                │ │
│  └──────────────────┘    └────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Request/Response Flow

```
Agent A (Writer)                Server                   Agent B (Reader)
      │                           │                           │
      │  PUT /streams/session-123 │                           │
      │  Content-Type: app/json   │                           │
      │ ─────────────────────────>│                           │
      │                           │                           │
      │  201 Created              │                           │
      │  Stream-Next-Offset: 0_0  │                           │
      │ <─────────────────────────│                           │
      │                           │                           │
      │  POST /streams/session-123│                           │
      │  Producer-Id: agent-a     │                           │
      │  Producer-Epoch: 0        │                           │
      │  Producer-Seq: 0          │                           │
      │  [{"type":"message",...}] │                           │
      │ ─────────────────────────>│                           │
      │                           │                           │
      │  204 No Content           │                           │
      │  Stream-Next-Offset: 0_45 │                           │
      │ <─────────────────────────│                           │
      │                           │                           │
      │                           │  GET /streams/session-123 │
      │                           │  Accept: text/event-stream│
      │                           │ <─────────────────────────│
      │                           │                           │
      │                           │  SSE: event: data         │
      │                           │  [{"type":"message",...}] │
      │                           │ ─────────────────────────>│
      │                           │                           │
      │  POST (more messages)     │                           │
      │  Producer-Seq: 1          │                           │
      │ ─────────────────────────>│                           │
      │                           │                           │
      │  204 No Content           │                           │
      │ <─────────────────────────│  SSE: event: data         │
      │                           │  (real-time update)       │
      │                           │ ─────────────────────────>│
```

## Producer Idempotency Headers

```
POST Request Headers                          Response Headers
┌──────────────────────────────────┐          ┌────────────────────────────────┐
│ Producer-Id     ─ Unique ID      │          │ Stream-Next-Offset ─ Next pos  │
│ Producer-Epoch  ─ Leader election│          │ Stream-Up-To-Date  ─ No more   │
│ Producer-Seq    ─ Sequence num   │          │ Stream-Cursor      ─ Cache key │
└────────────────┬─────────────────┘          └────────────────────────────────┘
                 │
                 │ Enables
                 ▼
┌──────────────────────────────────┐
│ Features                         │
│                                  │
│ • Idempotent Writes ─ Dedup      │
│ • Zombie Fencing    ─ Stale      │
│   producer rejection             │
│ • Ordering          ─ Gap        │
│   detection                      │
└──────────────────────────────────┘
```

## Package Dependencies

```
┌──────────────────────────┐        ┌───────────────────────────────────┐
│ apps/streams             │        │ packages/ai-chat                  │
│                          │        │                                   │
│  src/index.ts            │        │  src/index.ts                     │
│    │                     │        │    ├──▶ @durable-streams/client   │
│    ▼                     │        │    │     DurableStream             │
│  @durable-streams/server │        │    │                              │
│    DurableStreamTestServer│        │    └──▶ @durable-streams/state   │
│    FileBackedStreamStore │        │          State Protocol            │
│                          │        │          TanStack DB               │
└────────────┬─────────────┘        └──────┬──────────────┬─────────────┘
             │                             │              │
             │         Server API          │  Client API  │  State API
             │◄────────────────────────────┘              │
             │◄───────────────────────────────────────────┘
             │           HTTP / SSE
```
