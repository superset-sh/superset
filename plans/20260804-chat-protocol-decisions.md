# Chat Protocol v1 — Decision Walkthrough Log (2026-08-04)

Satya walked the eight load-bearing decisions of `plans/chat-protocol-v1.md` one at a time and ratified each. This is the record of what was chosen and why, so the reasoning can be re-derived without re-running the research.

| # | Decision | Choice | Why (one line) |
|---|----------|--------|----------------|
| 1 | Wire truth | Full item snapshots, upsert-by-id; no patch semantics | Duplicates/reordering can't corrupt state; Codex, ACP v2, and Cline all converged here; costs modest bandwidth |
| 2 | State building | One pure reducer for live + replay; host journal is the single source of truth | Deletes the "history renders differently than live" bug class; resume needs no special path |
| 3 | Token streaming | Deltas ephemeral (journal stores finished results only); one protocol, identical default subscriptions on every device | Journal/replay scale with content, not chattiness; per-channel opt-out exists as an unused knob, phones are full citizens |
| 4 | Resume safety | Epoch-qualified cursors; cross-epoch mismatch → clean refetch, never splice | Fixes the documented seq-overlap corruption bug in the current ACP stream; cost = one string field + rare full refetch |
| 5 | Approvals | `approval_request` items in the transcript; accept / accept-for-session / decline / cancel | Inline cards keep context and survive as history; the four intents are real (Codex + T3 Code identical enums) |
| 6 | Mid-turn sends | FIFO queue with visible `queued` tag; `steer` is the explicit interrupt with expectedTurnId CAS | Nothing lost or misdirected; deliberate interruption stays one action away; stale-view races fail closed |
| 7 | Editing history | `forkSession` always; original never truncated | Codex reversed their destructive version in prod; fork also powers regenerate and cross-harness continuation |
| 8 | Send receipts | Optimistic render reconciled by echoed `clientId`; visible pending/retry states | The T3 Code / Codex pattern, replacing our text-matching heuristic and mobile's silent send loss |

Clarifications recorded during the walkthrough:

- "Epoch" = one random ID minted when a session's journal is created (`historyId` in plain terms); it survives host restarts and changes only when the journal itself is rebuilt.
- Client-side caching tiers: in-memory snapshot + gap replay is the always-on mechanism; v1 cold-opens fetch a page from the host (no persisted device cache); a persisted device cache is a safe later addition precisely because the epoch check makes stale caches detectable.
- Decision 3 explicitly does NOT mean mobile behaves differently — v1 defaults are identical everywhere; the per-channel knob is future insurance only.

Not re-litigated here (accepted earlier in planning, recorded in the design docs): vocabulary donors (ACP v2 shapes + Codex mechanics), Claude adapter input = Agent SDK direct, dual-harness launch, single `packages/chat` package with entry-point boundaries, host runtime placement with extraction seam.
