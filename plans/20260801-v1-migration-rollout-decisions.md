# v1→v2 auto-migration — rollout decisions (2026-08-01)

Decisions made while CDP-verifying and hardening PR #5821 (boot trigger, migrate-then-flip, continuity). Supplements `20260716-v1-to-v2-auto-migration.md` (D1–D5 unchanged).

## Flip gate

- **Skips never block the flip.** Gate = `failed + deferred == 0` for projects + workspaces only (`computeGateComplete`). No-worktree-on-disk workspaces and ambiguous repos are "nothing to migrate", not pending work — aged installs always have some (Kiet's own snapshot: 23). Skips stay non-terminal, so a restored worktree still adopts later.
- **Unmapped workspaces count as skipped, not deferred** — their project's own outcome carries the gate blocking.
- **Persistent failures wait for the backstop.** `V1_FORCED_FLIP_VERSION` ships `null`; a later release sets it (using telemetry) to flip machines stuck on broken repos (detached-HEAD, duplicate-project). Manual "Import from v1" is their recovery path.

## Post-flip behavior

- **Migrator mounts on both surfaces.** On v2 it runs only while there's outstanding work — no perpetual passes.
- **First gate completion always arms one catch-up pass** on the first v2 boot: the pass runs at boot, so everything created during the *rest* of the final v1 session must be re-synced. This closes the last divergence window.
- **Best-effort kinds (settings/presets/terminals) retry post-flip** via the follow-up flag until clean (D4 as intended, previously unimplemented). Forced-flip machines keep running full passes until their gate completes.

## Reliability fixes

- Continuity flag consumed only **after** a successful navigate (failure retries next boot); run-guard is org-keyed.
- Preset migration waits for the agent-configs query to settle (no import against a still-loading empty agent list).
- Run lock: atomic `wx` create; live owners are never stolen (24h escape covers pid reuse only).

## Telemetry (rides in this PR — release is observable day one)

- `v1_auto_migration_completed`: per-kind counts, `gate_complete`, `trigger` (v1-surface | v2-followup), `first_completion`, `duration_ms`, up to 5 distinct ledger failure reasons.
- `v1_auto_migration_failed`: pass threw (error + duration).
- Dashboard insights added after first release (events must exist). Key cuts: `gate_complete` rate, `failure_reasons` of the stuck cohort.

## Accepted behaviors (documented, not fixed)

- v2 workspaces deleted **before** the first migration pass resurrect if their worktree survives (no tombstones; window closes after first pass ledgers everything). No file-level data is ever touched.
- Migrated presets / pending terminals live in renderer localStorage; a storage wipe between migration and first-open loses them (ledger prevents re-import). Manual import recovers.
- Settings changed in the final v1 session don't re-migrate (settings ledger rows are terminal; keep-v2 policy anyway).
- At flip, v1 UI becomes unreachable (D5) — v1 chat GUI history access ends at flip, not at code deletion. By decision.
- No "what changed" note (F5) — optional follow-up, feature not bug.

## Paced rollout (decided w/ Satya, 2026-08-01)

- **Flag `v1-auto-migration`** (PostHog 794331) gates NEW migrations on the v1 surface only — post-flip catch-up passes and manual import are ungated, so pausing the flag never strands a flipped machine. Off/unloaded/offline = stay on v1.
- **Live at 5%**, ramp 5 → 25 → 100 as the blocked-machines tile stays boring. Kill switch = flag off (stops new migrations only; flips are one-way by design).
- **20 high-profile domains excluded** until deliberately flipped last: wix, rtc-rcloud.jp, doordash, daangn, ziphq, knowbe4, alation, mistral.ai, netflix, microsoft, toss.im, addi, wealthbox, holded, opengov, upgrade, cyera.io, loancrate, ramp, thriveholdings (~650 of the ~5.6k weekly v1 users).
- Note: the forced-flip backstop bypasses the flag — only set `V1_FORCED_FLIP_VERSION` once the flag is at 100%.

## Release sequence

1. This release: migrator + fixes + telemetry + flag gate. `V1_FORCED_FLIP_VERSION=null`, `MINIMUM_DESKTOP_VERSION` unchanged. v1 code stays — migration runs *on* the v1 surface; flip is next-launch.
2. Watch 1–2 weeks: v1-only weekly actives (~5.6k at ship time, 52% of fleet) should collapse toward the stuck-cohort floor.
3. Next release: set `V1_FORCED_FLIP_VERSION`; optionally bump `MINIMUM_DESKTOP_VERSION` for the ~2.4k on ancient builds (forced update ≠ forced flip — separate levers).
4. When `surface=v1` is noise: deletion PR per `v1-v2-delete-patterns-audit.md`. Keep forever: local-db read access, migration router + headless migrator, import button.
