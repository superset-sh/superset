# Streaming Performance and Reliability Recommendations

This is the complete recommendation list for the current desktop + streams architecture and PR review.

## Critical correctness fixes

1. Fail `/generations/finish` when producer background errors occurred earlier in the run (not just log them).
2. In desktop, check `res.ok` for `/generations/finish`; treat non-2xx as failure.
3. Make `deleteSession` await producer drain/detach before returning `204`.
4. Flush producer before reset/control events so reset never races ahead of queued chunks.
5. Use one write path per session (prefer producer) for all session events to preserve global ordering.
6. Clear per-message seq state after normal assistant completion to avoid unbounded `messageSeqs` growth.
7. Add abort signal to chunk POSTs so interrupt cancels in-flight sends quickly.
8. Decide API semantics explicitly: `/chunks` should be `202 Accepted` (async ack) or `200` only after durable write.
9. If finish fails, emit an explicit terminal error marker so UI does not show a silent done.
10. Guard session close/reset/delete with a per-session mutex to avoid concurrent lifecycle races.

## Performance improvements (start streaming + stream path)

11. Remove `/generations/start` round trip; generate `messageId` client-side.
12. Add `/chunks/batch` endpoint to reduce per-chunk HTTP overhead.
13. Coalesce adjacent text deltas on desktop (small time/size window).
14. Replace per-chunk POST with one streaming upload channel (NDJSON or WebSocket) per generation.
15. Tune `IdempotentProducer` params (`lingerMs`, `maxBatchBytes`, `maxInFlight`) using load tests.
16. Reuse HTTP connections aggressively (keep-alive/pooling) for desktop to proxy writes.
17. Optionally compress large chunk payloads.
18. Optionally drop/coalesce low-value chunks (for example verbose reasoning deltas) under pressure.
19. Avoid unnecessary stringify/parse hops where possible in hot paths.
20. Add bounded queueing in desktop to prevent memory growth when proxy/network slows.

## Reliability and retry model

21. Add retry with backoff for transient chunk POST failures.
22. Add idempotency keys on chunk writes so retries do not duplicate logical chunks.
23. Track a per-session producer unhealthy state and fail fast until recovered.
24. Add fallback mode: switch to synchronous `stream.append` if producer repeatedly errors.
25. Fence stale writers with a generation token returned at generation start.
26. Ensure seq handling survives process restarts (or move seq assignment to client message stream).
27. Add explicit chunk ordering guarantees in API contract.
28. Add timeout + clear error for flush/finish so runs do not hang indefinitely.

## Protocol/API cleanups

29. Collapse `start/chunks/finish` into one generation lifecycle API with explicit generation id.
30. Add an optional strict-ack endpoint (`txid`) for flows that need synced-to-stream confirmation.
31. Standardize terminal semantics (`done` vs `message-end` vs `stop/error`) and document one canonical end signal.
32. Return structured error codes from finish/flush routes for better client behavior.
33. Define whether `/chunks` supports multi-writer per session; enforce if single-writer.
34. Add request/session/message IDs in all responses for tracing.

## Observability

35. Add metrics: queue depth, enqueue-to-flush latency, finish latency, dropped/retried chunks.
36. Add error counters: producer onError, finish failures, delete/reset race failures.
37. Add tracing context: `sessionId`, `messageId`, generation id, request id in logs.
38. Add SLO dashboards for time to first visible token and finish success rate.
39. Alert on rising async-ack failures (`200` or `202` accepted but later flush failed).
40. Sample payload size histograms to guide batching/coalescing thresholds.

## Tests to add

41. Integration test: producer error during stream causes finish to fail.
42. Integration test: delete waits for producer drain.
43. Race test: reset/delete during active streaming does not reorder/corrupt stream.
44. Load test: long responses (thousands of chunks) with bounded memory.
45. Chaos test: intermittent network failure with retries + idempotency.
46. Benchmark: current per-chunk POST vs batch vs streaming-upload modes.

## Rollout strategy

47. Ship behind a feature flag for producer async-ack behavior.
48. Canary compare metrics before/after (time to first token, finish failure, chunk loss).
49. Keep a runtime toggle to force synchronous append as emergency fallback.
50. Document an operational runbook for flush failures and stuck sessions.

## Non-stream PR issue

51. `core.hooksPath=/dev/null` is not cross-platform (fails on Windows); use OS-specific null device handling.

## Sources

### External references

- Durable Sessions blog post:
  - https://electric-sql.com/blog/2026/01/12/durable-sessions-for-collaborative-ai
- Transport repo (Durable Session client, proxy, materialization, transport resume):
  - https://github.com/electric-sql/transport
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/durable-session/src/client.ts
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/durable-session/src/collections/messages.ts
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/durable-session/src/materialize.ts
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/durable-session-proxy/src/protocol.ts
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/transport/src/client.ts
  - https://raw.githubusercontent.com/electric-sql/transport/main/packages/transport/src/stream.ts
- Electric examples (txid sync confirmation pattern):
  - https://github.com/electric-sql/electric
  - https://raw.githubusercontent.com/electric-sql/electric/main/examples/burn/assets/src/db/mutations.ts
  - https://raw.githubusercontent.com/electric-sql/electric/main/examples/burn/assets/src/db/transaction.ts
- Durable Streams producer behavior:
  - https://raw.githubusercontent.com/durable-streams/durable-streams/main/packages/client/src/idempotent-producer.ts

### Internal references (this repo)

- Stream protocol and producer usage:
  - `apps/streams/src/protocol.ts`
- Chunk/start/finish routes:
  - `apps/streams/src/routes/chunks.ts`
- Desktop chunk send ordering + finish call path:
  - `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts`
- Worktree hooks bypass change and tests:
  - `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts`
  - `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts`

### Source mapping by recommendation numbers

- `1-4`, `8-9`, `11`, `20`, `31`, `32`, `34`: supported by current implementation details in `apps/streams/src/protocol.ts`, `apps/streams/src/routes/chunks.ts`, and `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts`.
- `15`, `21-24`, `27-28`: informed by `IdempotentProducer` semantics in durable-streams client (`idempotent-producer.ts`) covering batching, pipelining, retries, and error surfaces.
- `30`: based on txid + wait-for-sync patterns in `packages/durable-session/src/client.ts` and Electric example `examples/burn/assets/src/db/mutations.ts`.
- `3`, `5`, `29`, `31`: informed by durable-session/proxy protocol design and materialization pipeline in `packages/durable-session-proxy/src/protocol.ts`, `packages/durable-session/src/collections/messages.ts`, and `packages/durable-session/src/materialize.ts`.
- `11-14`: reinforced by durable transport patterns for resumable streaming in `packages/transport/src/client.ts` and `packages/transport/src/stream.ts`.
- `51`: based on current repo changes and tests in `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.ts` and `apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts`.

Recommendations not explicitly mapped above are engineering suggestions derived from standard distributed systems and streaming architecture tradeoffs, not direct one-to-one source prescriptions.
