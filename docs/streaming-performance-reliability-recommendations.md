# Streaming Performance and Reliability Recommendations

This is the complete recommendation list for the current desktop + streams architecture and PR review.

## Critical correctness fixes

1. ~~Fail `/generations/finish` when producer background errors occurred earlier in the run (not just log them).~~ DONE
2. ~~In desktop, check `res.ok` for `/generations/finish`; treat non-2xx as failure.~~ DONE
3. ~~Make `deleteSession` await producer drain/detach before returning `204`.~~ DONE
4. ~~Flush producer before reset/control events so reset never races ahead of queued chunks.~~ DONE
5. ~~Use one write path per session (prefer producer) for all session events to preserve global ordering.~~ DONE
6. ~~Clear per-message seq state after normal assistant completion to avoid unbounded `messageSeqs` growth.~~ DONE
7. ~~Add abort signal to chunk POSTs so interrupt cancels in-flight sends quickly.~~ DONE
8. Decide API semantics explicitly: `/chunks` should be `202 Accepted` (async ack) or `200` only after durable write.
9. ~~If finish fails, emit an explicit terminal error marker so UI does not show a silent done.~~ DONE
10. ~~Guard session close/reset/delete with a per-session mutex to avoid concurrent lifecycle races.~~ DONE

## Performance improvements (start streaming + stream path)

11. ~~Remove `/generations/start` round trip; generate `messageId` client-side.~~ DONE
12. ~~Add `/chunks/batch` endpoint to reduce per-chunk HTTP overhead.~~ DONE
13. ~~Coalesce adjacent text deltas on desktop (small time/size window).~~ DONE (ChunkBatcher 5ms linger)
14. Replace per-chunk POST with one streaming upload channel (NDJSON or WebSocket) per generation.
15. ~~Tune `IdempotentProducer` params (`lingerMs`, `maxBatchBytes`, `maxInFlight`) using load tests.~~ DONE (lingerMs=1, maxInFlight=5)
16. Reuse HTTP connections aggressively (keep-alive/pooling) for desktop to proxy writes.
17. Optionally compress large chunk payloads.
18. Optionally drop/coalesce low-value chunks (for example verbose reasoning deltas) under pressure.
19. ~~Avoid unnecessary stringify/parse hops where possible in hot paths.~~ DONE (batch endpoint skips Zod)
20. ~~Add bounded queueing in desktop to prevent memory growth when proxy/network slows.~~ DONE (ChunkBatcher maxBufferSize=2000)

## Reliability and retry model

21. ~~Add retry with backoff for transient chunk POST failures.~~ DONE (ChunkBatcher 3 retries, 50ms base exponential)
22. ~~Add idempotency keys on chunk writes so retries do not duplicate logical chunks.~~ DONE (IdempotentProducer provides this via autoClaim/epoch)
23. ~~Track a per-session producer unhealthy state and fail fast until recovered.~~ DONE (producerHealthy map)
24. ~~Add fallback mode: switch to synchronous `stream.append` if producer repeatedly errors.~~ DONE (appendToStream checks producerHealthy)
25. ~~Fence stale writers with a generation token returned at generation start.~~ DONE (activeGenerationIds tracking)
26. ~~Ensure seq handling survives process restarts (or move seq assignment to client message stream).~~ DONE (IdempotentProducer autoClaim handles epoch)
27. ~~Add explicit chunk ordering guarantees in API contract.~~ DONE (IdempotentProducer provides ordering; ChunkBatcher sendChain preserves order)
28. ~~Add timeout + clear error for flush/finish so runs do not hang indefinitely.~~ DONE (FLUSH_TIMEOUT_MS = 10s)

## Protocol/API cleanups

29. ~~Collapse `start/chunks/finish` into one generation lifecycle API with explicit generation id.~~ DONE (removed /generations/start; generation auto-registers from first chunk)
30. ~~Add an optional strict-ack endpoint (`txid`) for flows that need synced-to-stream confirmation.~~ DONE (already in use via writeUserMessage txid pattern)
31. ~~Standardize terminal semantics (`done` vs `message-end` vs `stop/error`) and document one canonical end signal.~~ DONE (documented in types.ts: `message-end` = UI signal, `/finish` = server cleanup)
32. ~~Return structured error codes from finish/flush routes for better client behavior.~~ DONE (all routes have `code` field)
33. ~~Define whether `/chunks` supports multi-writer per session; enforce if single-writer.~~ DONE (single-writer via activeGenerationIds)
34. ~~Add request/session/message IDs in all responses for tracing.~~ DONE

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

## Adoption classification by item

Legend:

- `Local`: implement directly in this repo.
- `Vendor`: copy/adapt patterns from `electric-sql/transport` into workspace packages (`@superset/durable-session` / `apps/streams`) to keep tight control.
- `Package`: use upstream package capability directly (no vendoring).

1. Local
2. Local
3. Local
4. Local
5. Local
6. Local
7. Local
8. Local
9. Local
10. Local
11. Local
12. Local
13. Local
14. Local
15. Package
16. Local
17. Local
18. Local
19. Local
20. Local
21. Local
22. Local
23. Local
24. Local
25. Local
26. Local
27. Local
28. Local
29. Vendor
30. Package
31. Vendor
32. Local
33. Local
34. Local
35. Local
36. Local
37. Local
38. Local
39. Local
40. Local
41. Local
42. Local
43. Local
44. Local
45. Local
46. Local
47. Local
48. Local
49. Local
50. Local
51. Local

### Notes on `Vendor` and `Package` items

- `15 (Package)`: use `@durable-streams/client` producer tuning knobs (`lingerMs`, `maxBatchBytes`, `maxInFlight`) directly.
- `29 (Vendor)`: if you collapse lifecycle APIs, adapt from `durable-session-proxy` patterns rather than hard-switching architecture.
- `30 (Package)`: use txid + await-sync capability from durable state/client primitives.
- `31 (Vendor)`: reuse durable-session materialization/terminal handling patterns from `electric-sql/transport` where it matches Superset semantics.
