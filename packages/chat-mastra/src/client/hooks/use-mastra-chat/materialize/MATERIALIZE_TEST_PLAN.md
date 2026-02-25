# Chat Mastra Materialization Test Plan

This document is the durable checklist for `useMastraChat` materialization correctness.
Goal: deterministic, replay-safe output from raw stream events for all supported edge cases.

## Scope

- In scope: pure materialization logic from stored event envelopes/rows.
- In scope: contract parity with Mastra harness event semantics.
- Out of scope: runtime session lifecycle tests (covered elsewhere).

## Primary Invariants

- `I-01`: Same input event sequence always produces the same output state.
- `I-02`: Replaying from persisted rows yields identical output to live ingestion.
- `I-03`: Session mixing never leaks events across sessions.
- `I-04`: Event ordering behavior is explicit and tested (sorted vs caller-ordered).
- `I-05`: Unknown events are preserved in auxiliary channels, not dropped silently.
- `I-06`: Crash/restart sequence resets do not destroy prior history.
- `I-07`: User-intent submit events are represented even when harness does not emit user message events.
- `I-08`: Upstream harness event type changes fail tests until explicitly classified.

## Existing Coverage (already implemented)

- `MZ-MAT-001` Empty input default state.
- `MZ-MAT-002` Session id bootstrap from first event.
- `MZ-MAT-003` Session filtering.
- `MZ-MAT-004` Sequence reset epoch handling.
- `MZ-MAT-005` Submit user message materialization.
- `MZ-MAT-006` Submit controls materialization.
- `MZ-MAT-007` Agent start/end running lifecycle.
- `MZ-MAT-008` Message start/update/end consolidation.
- `MZ-MAT-009` Usage update handling.
- `MZ-MAT-010` Error extraction handling.
- `MZ-MAT-011` Unknown submit/harness event fallback.
- `MZ-MAT-012` Real fixture: auth error.
- `MZ-MAT-013` Real fixture: late abort.
- `MZ-MAT-014` Real fixture: crash resume.
- `MZ-MAT-015` Materialize from rows sorting behavior.
- `MZ-MAT-016` Harness event union classification parity check.
- `MZ-MAT-017` Verify user turns come from submit events, not harness user message payloads.

## Pending Static Test Cases

### A. Ordering and Replay

- `[x] MZ-MAT-101` Duplicate event replay idempotency (same envelope repeated N times).
- `[x] MZ-MAT-102` Stable tie-breaking with identical timestamp and identical sequence hint.
- `[x] MZ-MAT-103` Out-of-order ingestion with explicit caller-order mode expectations.
- `[x] MZ-MAT-104` Large replay (10k+ envelopes) deterministic hash snapshot.
- `[x] MZ-MAT-105` Sequence reset across three epochs with interleaved control submits.

### B. Message Semantics

- `[ ] MZ-MAT-201` Streaming text + thinking + tool content parts mixed in one assistant message.
- `[ ] MZ-MAT-202` Message updates with partial payload regressions (missing fields mid-stream).
- `[ ] MZ-MAT-203` Multiple concurrent assistant message ids in same run.
- `[ ] MZ-MAT-204` Message end without prior start creates valid complete fallback entry.
- `[ ] MZ-MAT-205` Stop reason mapping coverage (`complete`, `aborted`, `error`, `tool_use`).
- `[ ] MZ-MAT-206` System-role harness messages preserved.

### C. Submit Intent Semantics

- `[ ] MZ-MAT-301` Submit user message with files + metadata persists in user-origin view model.
- `[ ] MZ-MAT-302` Submit approval/question/plan events captured as auxiliary or typed control lane (as designed).
- `[ ] MZ-MAT-303` Client message id collision between sessions does not dedupe cross-session.
- `[ ] MZ-MAT-304` Empty submit payload fallback behavior remains non-throwing.

### D. Tool/Prompt/Plan Events

- `[ ] MZ-MAT-401` Tool input streaming lifecycle (`tool_input_start/delta/end`) classification.
- `[ ] MZ-MAT-402` Tool approval required emitted and preserved for UI actions.
- `[ ] MZ-MAT-403` Ask question and plan approval required events preserved with payload integrity.
- `[ ] MZ-MAT-404` Subagent lifecycle event chain preserved (start -> deltas -> tool calls -> end).

### E. OM (Observational Memory) Events

- `[ ] MZ-MAT-501` `om_status` payload snapshots parse and persist predictably.
- `[ ] MZ-MAT-502` OM observation/reflection start-end-failed triads preserve order.
- `[ ] MZ-MAT-503` OM buffering/activation lifecycle preserved.
- `[ ] MZ-MAT-504` OM model change events preserved.

### F. Failure Modes

- `[x] MZ-MAT-601` Corrupted payload JSON in persisted rows is non-fatal and isolated.
- `[x] MZ-MAT-602` Missing required envelope fields are rejected or safely skipped (explicit policy test).
- `[x] MZ-MAT-603` Unknown future harness event type still retained in auxiliary lane.
- `[x] MZ-MAT-604` Mixed clock skew timestamps do not break deterministic sorting path.

### G. Contract Compatibility

- `[ ] MZ-MAT-701` Shimmed display-state contract shape remains assignable to upstream `HarnessDisplayState` when available.
- `[ ] MZ-MAT-702` Materialized output adapter to `UseMastraChatState` preserves invariant `messages === state.materialized.messages`.
- `[ ] MZ-MAT-703` Backward compatibility fixture snapshots for one pinned mastracode version.
- `[ ] MZ-MAT-704` Forward compatibility guard for newer harness union members (test fails until mapped).

## Real-World Fixture Capture Plan

Run this loop repeatedly to build fixtures with real harness output:

- `F-01` Start probe server.
- `F-02` Open one session, send one normal message, close session.
- `F-03` Open one session, trigger abort mid-stream.
- `F-04` Open one session, force auth/model error.
- `F-05` Open one session, trigger approval-required flow.
- `F-06` Open one session, trigger ask-question flow.
- `F-07` Open one session, trigger plan-approval flow.
- `F-08` Open one session, run file/tool actions that emit tool input/output deltas.
- `F-09` Open one session, crash process and resume.
- `F-10` Save per-session NDJSON fixture with a scenario id and timestamp.

For each captured fixture:

- `R-01` Add fixture under `src/client/hooks/use-mastra-chat/materialize/fixtures/<scenario>/<variant>/`.
- `R-02` Add one focused static test referencing the fixture.
- `R-03` Assert key invariants and expected minimal output state.
- `R-04` Record new case id in this document as completed.

## Execution Order

- Phase 1: `MZ-MAT-101..105`, `MZ-MAT-601..604` (core safety).
- Phase 2: `MZ-MAT-201..206`, `MZ-MAT-301..304` (message + intent correctness).
- Phase 3: `MZ-MAT-401..404`, `MZ-MAT-501..504` (tool + OM).
- Phase 4: `MZ-MAT-701..704` (contract migration hardening).
