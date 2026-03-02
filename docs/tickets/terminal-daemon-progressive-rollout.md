# Terminal Daemon Progressive Rollout (Code Change Handoff)

## Context

Task: `terminal-workspace-loading-issues-after-new-update`  
Symptoms reported after update:
- Terminals intermittently fail to open
- Workspaces can appear blank or disappear on navigation
- "Connection lost" states that often require daemon restart

Recent mitigation added in code:
- Hard daemon restart on version mismatch during handshake

Gap:
- We still perform an all-or-nothing daemon restart.
- Desired behavior is progressive migration: new terminals use new daemon, old terminals keep running until they naturally exit.

## Goal

Implement generation-based daemon rollout so updates do not disrupt existing terminal sessions:
- New terminal sessions attach to the latest daemon generation
- Existing sessions continue on their original daemon generation
- Old generations drain and shut down automatically when no longer needed

## Non-Goals

- No cloud/remote runtime work
- No changes to terminal rendering behavior
- No schema/database migration for this feature

## Proposed Design

Use daemon generations with explicit lifecycle states:
- `preferred`: receives new sessions
- `draining`: keeps existing sessions only
- `retired`: stopped and removed from active routing

Each daemon generation gets:
- Unique socket path (`terminal-host.<generation>.sock`)
- Runtime metadata (`generationId`, `appVersion`)
- Registry entry persisted in `~/.superset`

## Required Code Changes

### 1) Extend terminal-host IPC types
File: `apps/desktop/src/main/lib/terminal-host/types.ts`

Additive fields:
- `HelloResponse.generationId: string`
- `CreateOrAttachResponse.generationId: string`
- `ListSessionsResponse.sessions[].generationId: string`

Keep fields optional where needed for backward compatibility with pre-rollout daemons.

### 2) Add daemon registry module
New files:
- `apps/desktop/src/main/lib/terminal-host/daemon-registry.ts`
- `apps/desktop/src/main/lib/terminal-host/daemon-registry.test.ts`

Responsibilities:
- Store/read registry file (example: `terminal-daemons.json`) under `~/.superset`
- Track:
  - `generationId`
  - `socketPath`
  - `pid`
  - `appVersion`
  - `state` (`preferred` | `draining` | `retired`)
  - `createdAt`, `updatedAt`, `lastSeenAt`
- Atomic write and corruption recovery
- Stale PID/socket cleanup

### 3) Make daemon generation-aware
File: `apps/desktop/src/main/terminal-host/index.ts`

Changes:
- Read generation metadata from env
- Bind socket using generation-specific path
- Emit `generationId` in hello response
- Include `generationId` in create/list session responses
- Register/unregister self in registry on startup/shutdown

### 4) Refactor client for generation routing
File: `apps/desktop/src/main/lib/terminal-host/client.ts`

Changes:
- Replace single global socket assumption with generation-targeted connection path
- Resolve `preferred` daemon generation for new `createOrAttach`
- Track `sessionId -> generationId` after successful attach
- Route `write`, `resize`, `detach`, `kill` to the session's generation
- If preferred daemon is unhealthy:
  - fallback to a healthy draining daemon temporarily, or
  - spawn a fresh preferred daemon

Keep current version mismatch restart logic as a fallback guard, not the primary migration path.

### 5) Add rollout coordinator
Files:
- `apps/desktop/src/main/lib/terminal/index.ts`
- (optional new file) `apps/desktop/src/main/lib/terminal-host/daemon-rollout.ts`

Behavior:
- On startup:
  - ensure a preferred daemon exists for current app version
  - demote prior preferred daemon(s) to draining
- Background reconcile loop:
  - poll draining daemon session counts
  - stop and retire drained generations (or enforce max drain age)

### 6) Integrate terminal manager/session reporting
File: `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`

Changes:
- Preserve session behavior while consuming generation-aware metadata
- Ensure list/reconcile paths still work with mixed generation sessions

### 7) Update tests
Files:
- `apps/desktop/src/main/terminal-host/daemon.test.ts`
- `apps/desktop/src/main/terminal-host/session-lifecycle.test.ts`
- `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.test.ts`
- `apps/desktop/src/main/lib/terminal-host/daemon-registry.test.ts` (new)

Coverage to add:
- Hello includes `generationId`
- New sessions route to preferred generation
- Existing sessions stay alive on previous generation while new one is active
- Draining generation retires after last session closes
- Registry corruption/stale socket recovery

## Implementation Sequence

1. Types + daemon registry (safe, isolated)
2. Daemon generation socket + metadata emission
3. Client generation routing with session mapping
4. Rollout coordinator (promotion/draining/retirement)
5. Tests for mixed-generation lifecycle
6. Remove/limit hard restart paths once rollout behavior is stable

## Acceptance Criteria

- App update does not force-kill existing terminal sessions
- New terminal tabs after update use the new daemon generation
- Existing sessions continue functioning on old generation
- Old generation exits automatically after draining
- No increase in terminal "connection lost" or blank workspace incidents during update

## Operational Notes

- Add structured logs for generation transitions:
  - promoted preferred
  - marked draining
  - retired generation
  - fallback routing decisions
- Keep cleanup conservative: only remove sockets/PIDs that fail liveness checks

## Suggested Follow-up (Optional)

- Add debug UI in terminal settings to display active generations and session counts
- Add telemetry event for rollout transitions and fallback frequency
