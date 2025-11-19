# Desktop State & Persistence Refactor Plan

Author: Platform
Status: Proposed
Audience: Agents working on Desktop app state/persistence

## Context

The Desktop app’s current persistence mixes runtime data (worktrees) with UI and domain concerns in a single JSON file. This leads to drift (e.g., worktrees out of sync with Git) and makes the state model hard to evolve. We also want to align domain models with the CLI types while keeping CLI and Desktop storage separate for now.

## Goals

- Make Git the single source of truth for worktrees (scan, don’t trust JSON).
- Split persistence into coherent, versioned slices aligned to CLI domain types and Desktop UI.
- Keep Desktop and CLI persistence separate locations.
- Establish a deterministic loading sequence with background rescan/reconciliation.
- Preserve type safety and the type-safe IPC pattern.

## Non‑Goals

- Do not merge CLI and Desktop persistence yet.
- Do not introduce new runtime dependencies or database engines.
- Do not prescribe file‑level code changes; this plan guides architecture/tasks.

## Principles

- Decouple domain, UI, and derived state.
- Prefer immutable sources (Git) over persisted lists for worktrees.
- Persist only what cannot be derived (domain objects, UI state).
- Use existing CLI types as the canonical domain shape.

## State Domains

- Domain (persisted; aligns with CLI types)
  - Environment, Workspace (LocalWorkspace for Desktop), Process/Agent/Terminal, Change, FileDiff, AgentSummary.
- UI (persisted; Desktop‑only)
  - Window state, last active workspace.
  - Per‑workspace UI state: active worktree selection, active tab, tabs, mosaic layout, per‑tab CWD/URL, worktree metadata (description, prUrl, merged).
- Derived (in‑memory / cache)
  - Worktrees scanned from Git (branch/path), detected ports, short‑lived git status.

## Persistence Split

- CLI location remains separate (unchanged): `~/.superset/cli/`.
- Desktop location (new): `~/.superset/desktop/`
  - db/ (domain; versioned)
    - environments, workspaces (LocalWorkspace), processes, changes, fileDiffs, agentSummaries (split by collection).
    - db.version
  - ui/ (Desktop‑only; versioned)
    - window-state.json, settings.json (lastActiveWorkspaceId, preferences)
    - workspaces/<workspaceId>.json (per‑workspace UI state)
    - ui.version
  - cache/ (ephemeral)
    - ports.json, optional git status caches

Note: The “split by file per collection” is to keep the “not one big JSON” requirement. If a single domain DB file is preferred later, keep collections separate within the file while UI remains separate.

## Loading Flow (High‑Level)

1. App Boot (Main)
   - Load env with override (uses find-up logic to locate monorepo root .env robustly).
   - Initialize domain store targeting `~/.superset/desktop/db/`.
   - Load UI settings (window + last active workspace) from `~/.superset/desktop/ui/`.
2. Activate Workspace
   - Read domain workspace (LocalWorkspace) by id.
   - Scan Git for worktrees (path/branch/bare) using the workspace repo path.
   - Merge: join scanned worktrees with per‑workspace UI metadata keyed by worktree path (fallback to branch when needed).
   - Initialize defaults for new worktrees (e.g., a terminal tab) in UI state when appropriate.
   - Cache the scan result as the "activation-time snapshot" for diff tracking.
   - Start background tasks: periodic rescans (every 30s), port detection for terminals in the active worktree, update proxy targets.
3. Refresh
   - Manual rescan via IPC and periodic rescan reconcile UI metadata with Git (remove orphans after a grace period; retain notes when possible).
   - **Important**: The first rescan after activation produces diffs relative to the activation-time snapshot only. Therefore, `workspace-activate` must be called once before `workspace-rescan` for meaningful diffs. If the renderer triggers a rescan before activation finishes, diffs will be empty.

## Worktree Strategy

- Always treat Git as truth for current worktrees.
- Never load authoritative worktree lists from persistence.
- Maintain per‑worktree UI metadata keyed by worktree path (primary) and branch (secondary) to survive path changes or renames.

## IPC Contracts (Conceptual)

- Workspace
  - workspace.activate: { workspaceId } → composed state (domain workspace + scanned worktrees + UI state)
  - workspace.rescan: { workspaceId } → rescan result (diff + composed state)
- UI
  - ui.workspace.get: { workspaceId } → current per‑workspace UI state
  - ui.workspace.update: { workspaceId, patch } → update specific UI fields
  - ui.set-active: { workspaceId, activeWorktreePath?, activeTabId? } → updates global active workspace and per-workspace active worktree/tab
    - **Important**: Renderer must call `ui.set-active` when switching workspaces to ensure `lastActiveWorkspaceId` is persisted. This ensures the correct workspace is restored on next launch.
- Processes (domain)
  - process.list/create/stop/stopAll following CLI type semantics

Use existing type‑safe IPC conventions (object params; shared channel type definitions). Exact channel names and types should be captured in the shared IPC types file before implementing.

## Migration Strategy (One‑Time)

- Trigger: Detect legacy `~/.superset/config.json` and an empty `~/.superset/desktop/`.
- Mapping
  - Desktop Workspace → Domain LocalWorkspace (id preserved; repoPath → path; type=local; environmentId=default).
  - Worktrees: stop persisting worktree arrays as authoritative; create per‑workspace UI metadata keyed by worktree path (description, prUrl, merged, tabs, mosaic layout).
  - Active selection: move to UI settings (lastActiveWorkspaceId) and per‑workspace UI (`activeWorktreePath`, `activeTabId`).
  - Window/layout prefs: move to UI/window state.
- Versioning and Safety
  - Initialize `db.version=1` and `ui.version=1`.
  - Atomic writes with backup of legacy file.
  - Validate schemas; skip/record invalid entries.

## Risks & Mitigations

- Worktree rename/path changes: primary key by path, secondary by branch; prompt on ambiguity.
- Large repos: throttle rescans; make resumable/cancellable; limit scope to worktrees rather than full repo.
- Partial writes: **Implemented** - UI store uses atomic write pattern (write to *.tmp, fsync, rename) for all persistence operations (window-state.json, settings.json, per-workspace UI state). This prevents data corruption on crash.
- Port detection flapping: debounce updates; only persist stable snapshots in UI or cache.

## Milestones

- M1: Establish Desktop domain store (separate root) and UI store scaffolding; no behavior change.
- M2: Compose workspace state from Git + UI (stop depending on persisted worktree arrays).
- M3: IPC endpoints for activation/rescan/UI updates exposed; renderer consumes composed state.
- M4: Migration path from legacy config with backups and versioning.
- M5: Background rescans + port/proxy refresh handling; logs and metrics.

## Task Checklist (Agent‑Oriented)

- [ ] Define Desktop domain store interfaces aligning with CLI types; point storage root to `~/.superset/desktop/db/`.
- [ ] Define UI store for `~/.superset/desktop/ui/` with schemas for window, settings, and per‑workspace UI.
- [ ] Implement composition logic: read domain workspace → scan Git → merge with UI metadata by worktree path.
- [ ] Add a periodic rescan strategy (interval + manual trigger) and reconciliation rules.
- [ ] Specify IPC channel contracts in shared IPC types for workspace activate/rescan and UI get/update.
- [ ] Implement migration runner (detect legacy file, map to new domain+UI slices, write backups, set versions).
- [ ] Add structured logs for scans, merges, and migrations; include a “dry run” mode for migration.
- [ ] Validate with sample repos and multi‑worktree setups; confirm no reliance on persisted worktree arrays.

## Validation & Observability

- Unit and integration checks for composition (new/missing/renamed worktrees).
- Migration dry‑run and post‑migration verification (counts, ids, schema validation).
- Log key events: activation, rescan diff, migration start/end, errors.
- Optional telemetry counters (worktrees detected, UI orphans pruned) if allowed by the project.

## Open Questions

- Should ports configuration be domain (shared) or UI (Desktop‑only)? For now, keep it in UI; revisit if multiple apps share it.
- Grace period policy for orphaned UI metadata (immediate prune vs delayed cleanup)?
- Desired default tab layout for newly detected worktrees?

---

Implementation may proceed behind a feature flag or staged rollout per milestones above. This document intentionally avoids prescribing specific file edits; it defines outcomes, boundaries, and tasks for agents to execute.

