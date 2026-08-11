# Consolidate reconnecting WebSocket clients on partysocket

Ticket: SUPER-1469 · Prereq: PR #5628 (merged — relay `_whoowns` now returns 403 on definitive denial)

## Problem

Three hand-rolled reconnecting-WS clients re-solve backoff, buffering, and token freshness:

| Transport | Lines | Consumers | Token handling today |
|---|---|---|---|
| `packages/workspace-client/src/lib/eventBus.ts` | ~400 | 9 files | sync `getWsToken()` per attempt |
| `apps/web/.../WebTerminal/TerminalConnection.ts` | ~240 | 1 | async TTL-cached token per attempt (correct) |
| `apps/desktop/.../terminal-ws-transport.ts` | ~665 | via registry | fresh-token re-sign per attempt (fixed in #5628) |

The desktop copy's drift caused the July 2026 401 reconnect-loop bug (~25 users/day). One library removes the bug class instead of patching each copy.

## Decision

Adopt `partysocket` (Cloudflare/PartyKit's maintained reconnecting-websocket fork; generic `WebSocket` export, no PartyKit coupling). Key primitive: `url` accepts `() => Promise<string>`, evaluated before **every** connection attempt — fresh token per dial for free. Also: `maxRetries`, delay bounds + grow factor, `connectionTimeout`, `minUptime`, `maxEnqueuedMessages`, `binaryType`, permanent `close()`.

## Design: shared wrapper in `packages/workspace-client`

One `createRelaySocket(opts)` (~150 lines) wrapping partysocket's generic export:

- **URL provider**: async, calls the caller's token getter (desktop `ensureFreshJwt`, web `getAuthToken`) and signs the URL per attempt.
- **Preflight**: runs `primeRelayAffinity` (`_whoowns`) inside the provider before returning the URL — pins Fly edge affinity and surfaces the real HTTP status the WS API hides.
- **Fatal denial**: preflight **403** (only — 401 means expired token and self-heals via the provider) → permanent `close()` + `onAccessDenied` callback. Non-terminal consumers may instead pass `accessDeniedRetryMs` (eventBus: 5 min).
- **Bounded buffering**: `maxEnqueuedMessages` mapped from each transport's current cap.

## Phases

1. **Spike (blocking)**: partysocket's behavior when the async `url` provider *rejects* is undocumented — verify it schedules a retry (vs wedging/unhandled rejection) before building on it. Also confirm `event-target-polyfill` behaves in the Electron renderer.
2. **eventBus** (~½–1d): replace `connect`/`scheduleReconnect` internals; `getEventBus` API and fs:watch resend unchanged → zero consumer changes.
3. **Web TerminalConnection** (~½–1d): dedupe (not a fix — web already refreshes correctly); keep attach/replay semantics.
4. **Desktop terminal transport**: deferred. Only ~200/665 lines are dial/backoff; the rest (sleep/wake watchdog, write coalescer, replay flags, epoch guards, telemetry) must be re-hung on partysocket's silent socket-swapping model — high regression risk on just-verified code for mostly aesthetic gain. Revisit when the transport needs touching anyway.

## Risks / constraints

- partysocket swaps the underlying socket silently; code that compares socket identity (desktop transport does) needs restructuring — main reason phase 4 is deferred.
- React Native: cloudflare/partykit#401 (Hermes lacks `MessageEvent`) — check before any apps/mobile use.
- Relay semantics (post-#5628): 401 = expired/invalid JWT (retry with fresh token), 403 = definitive access denial (stop/slow-poll). The wrapper must never treat 401 as fatal.
- New WS consumers should use the wrapper from day one.

## Outcome (2026-07-12)

Phases 1–3 shipped in PR #5637 (SUPER-1469). Spike result: a rejecting async
url provider surfaces as an error event and re-enters partysocket's backoff
loop — verified against source (`ws.js` `_connect` catch) and empirically.
Phase 4 (desktop terminal transport) deferred as designed; revisit when that
transport needs touching anyway.

### Verification record (details in PR #5637 comments)

- **Tests**: 17 across wrapper / eventBus (first-ever suite) / web
  TerminalConnection (DI'd `getToken`/`relayUrl` for testability). The
  fresh-token-redial test fails if #5628's stale-URL bug is reintroduced
  (mutation-verified).
- **Perf bench**: partysocket's per-message clone+dispatch costs ~0.56µs/frame
  (574k → 434k frames/sec on 512B binary frames) — noise at real terminal
  rates; desktop hot path unmigrated.
- **Live E2E (CDP)**: desktop eventBus connects; web terminal attached over a
  local relay + tunnel, echoed output, and survived a mid-session relay
  restart — preflight probed 5× (503, no WS dials) then 200 → reattach with
  scrollback, ~15s, zero user action.
- **Stress, branch vs revert** (150 conns, 15k-event flood, 3× flap): parity
  on throughput/delivery/herd-size/cleanup. Deltas: +0.35ms per connect,
  ~+5KB heap per connection, and backoff escalates under sub-5s flapping
  (resets after 5s uptime — verified) — deliberate relay protection.
- **Net behavior gains**: web terminals get fly-affinity preflight (blind
  dials were the SUPER-1157 symptom surface), definitive 403s cost zero WS
  dials (was 12 blind attempts), hung connects recover in 4s (was unbounded).
