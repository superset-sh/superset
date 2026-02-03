# Cloud Background Agent Parity Plan (Consolidated)

## Goal
Reach feature parity and UX quality with Ramp Inspect / Open-Inspect for cloud sessions:
- Fast sandbox startup (snapshots + warm-on-typing)
- Rich session UI (participants, artifacts, tasks, files changed)
- Durable session continuity (full history)
- Multi-client readiness (desktop + web, future Slack)

## Scope
- Web app: `apps/web/src/app/cloud/*`
- Control plane: `packages/control-plane/*`
- Modal sandbox: Modal endpoints + infra
- Desktop: webview wrapper + session list

## References
- [Ramp Blog Post](https://builders.ramp.com/post/why-we-built-our-background-agent)
- [ColeMurray/background-agents](https://github.com/ColeMurray/background-agents) (Open-Inspect)
- Previous plan: `20260130-cloud-workspaces-integration.md` (superseded by this plan)

---

## Completed (from previous sprints)

### Infrastructure ✅
- [x] Control Plane (Cloudflare Workers) - Deployed
  - Session Durable Objects with SQLite storage
  - WebSocket support for real-time events
  - REST API for session management
  - HMAC token auth for Modal
  - Chat history persistence (last 100 messages + 500 events on subscribe)
- [x] Modal Sandbox (Python) - Deployed
  - Git clone and branch management
  - Claude Code CLI execution
  - Event streaming to control plane
- [x] Database schema (`packages/db/src/schema/cloud-workspaces.ts`)
- [x] tRPC router (`packages/trpc/src/router/cloud-workspace/`)

### Web App ✅
- [x] Home page with session list, search, active/inactive grouping
- [x] New session flow with GitHub repo selection
- [x] Quick repo selector on home page with recent repos
- [x] Chat UI with user/assistant messages, markdown rendering
- [x] Tool call display with collapsible groups
- [x] Processing & connection state indicators
- [x] WebSocket reconnection with attempt counter
- [x] Keyboard shortcuts (⌘+Enter, Escape, ⌘+K, ⌘+\)
- [x] Session lifecycle (inline title edit, archive)

### Desktop ✅
- [x] Cloud workspaces section in sidebar
- [x] WebView embedding web app

---

## MVP Phases

### Phase 1: Developer Experience (Parallel Track) ✅
*Can run in parallel with Phase 2*

#### 1.1 Ngrok Setup for Local GitHub OAuth ✅
- [x] Document ngrok setup: See [`ngrok-setup.md`](./ngrok-setup.md)
- [x] Reserved static ngrok domain approach documented
- [x] Full setup guide with troubleshooting

#### 1.2 Error Recovery & Reliability ✅
- [x] Sandbox spawn failure handling + auto-retry (max 3 attempts)
- [x] Stale sandbox detection (60s heartbeat timeout) and auto-respawn
- [x] WebSocket disconnect recovery with pending prompt queue
- [x] Graceful degradation when control plane unavailable
- [x] `isControlPlaneAvailable` state, `clearError()` function, retry UI

### Phase 2: Sandbox Speed (Core)

#### 2.1 Warm-on-Typing (High Priority) ✅
Reference: Ramp spawns sandbox when user starts typing

**Web App Changes:**
- [x] Add `typing` message type to WebSocket protocol
- [x] Send typing indicator on first keystroke (debounced 500ms)
- [x] Show "Warming..." status in UI with spinner

**Control Plane Changes:**
- [x] Add `handleTyping()` method in durable-object.ts
- [x] Spawn sandbox on first typing event if not running
- [x] Add `isSpawningSandbox` flag to prevent duplicate spawns
- [x] Broadcast `sandbox_warming` status to clients

#### 2.2 Warm-on-Repo-Select (Home Page) ✅
- [x] Optimistic navigation - redirect immediately on submit with URL param
- [x] Auto-send initial prompt when sandbox becomes ready
- [ ] Pre-warm sandbox on repo select (deferred - requires orphan sandbox support)
- [ ] Show sandbox status indicator next to repo dropdown (deferred)

#### 2.3 Snapshot Registry
*Deferred - requires Modal infrastructure changes*
- [ ] Define `snapshot_registry` table: repo, base_sha, snapshot_id, status, created_at, expires_at
- [ ] Add control plane endpoint: `GET /snapshots/:repoOwner/:repoName/latest`
- [ ] Store latest snapshot ID per repository

#### 2.4 Snapshot Scheduler
*Deferred - requires Modal infrastructure changes*
- [ ] Background job to rebuild repo images every 30 minutes
- [ ] Create Modal snapshot after image build
- [ ] Update snapshot registry with new snapshot ID
- [ ] Expire old snapshots after 24 hours

#### 2.5 Restore + Delta Sync
*Deferred - requires Modal infrastructure changes*
- [ ] Update sandbox spawn to restore from snapshot when available
- [ ] Delta sync: only fetch commits since snapshot base_sha
- [ ] Allow file reads during sync; block writes until complete

### Phase 3: Control Plane Enhancements

#### 3.1 Session History Completeness
Current state: Control plane sends last 100 messages + 500 events, but assistant message *content* may be incomplete.

- [ ] Audit: Verify assistant messages include full text content
- [ ] Persist tool call results in history (not just tool_use events)
- [ ] Ensure idempotent replay in UI (dedupe by event ID)

#### 3.2 Artifacts System
- [ ] Add `artifacts` table: session_id, type, url, metadata, created_at
- [ ] Artifact types: `pr`, `preview`, `screenshot`
- [ ] Detect PR creation from tool events, auto-create artifact
- [ ] Expose artifacts via WebSocket `artifacts_update` event
- [ ] REST endpoint: `GET /sessions/:id/artifacts`

#### 3.3 Files Changed Rollup
- [ ] Aggregate file paths from Write/Edit tool events
- [ ] Store in session state: `files_changed: string[]`
- [ ] Broadcast on WebSocket when files change
- [ ] Dedupe and sort by most recently modified

#### 3.4 Presence & Multiplayer
- [ ] Track participant presence in DO (userId, status, lastSeen)
- [ ] Emit `presence_sync` on subscribe (all current participants)
- [ ] Emit `presence_update` on join/leave/idle
- [ ] Attribute prompts to participant userId

### Phase 4: Web UI Parity

#### 4.1 Right Sidebar
- [ ] Collapsible sidebar component (Inspect-style)
- [ ] **Metadata section**: model, repo, branch, created/updated timestamps
- [ ] **Participants section**: avatars with online/idle/offline indicators
- [ ] **Files changed section**: list of modified files with icons
- [ ] **Artifacts section**: PR link, preview link with status badges

#### 4.2 Action Bar
- [ ] "View PR" button (visible when PR artifact exists)
- [ ] "View Preview" button (visible when preview artifact exists)
- [ ] "Copy Link" button (copies session URL)
- [ ] Archive/Unarchive toggle

#### 4.3 Session Continuity UX
- [ ] Render full assistant history on page load/reconnect
- [ ] Show pending prompt indicator when sandbox warming
- [ ] Sandbox timeline: warming → syncing → ready → running
- [ ] "Sandbox disconnected, reconnecting..." banner

### Phase 5: Desktop Polish
- [ ] Surface sandbox status badges in desktop session list
- [ ] Deep links to PR/preview from desktop UI
- [ ] Verify webview auth persistence across app restarts
- [ ] Handle webview navigation (prevent external links breaking session)

### Phase 6: Metrics & Observability
- [ ] Track sandbox spawn time (p50, p95, p99)
- [ ] Track time-to-first-token after prompt submit
- [ ] Track warm-on-typing hit rate (% of prompts with pre-warmed sandbox)
- [ ] Dashboard in admin panel or external tool (Grafana/Datadog)

---

## Post-MVP Phases

### Phase 7: Warm Pool (Deferred)
*Adds complexity; defer until MVP validated*

- [ ] Maintain pool of pre-warmed sandboxes for top N repos
- [ ] Pool size configurable per org (cost management)
- [ ] Expire pool entries when new snapshot created
- [ ] Claim from pool on session create, spawn new if empty

### Phase 8: Embedded Tools (Deferred)
*High complexity; consider alternatives first*

- [ ] Hosted VS Code Server in sandbox with iframe embed
- [ ] Live preview stream via port proxy
- [ ] Screenshot gallery for visual artifacts
- [ ] **Alternative**: Link to GitHub Codespaces / external editor

### Phase 9: Multi-Client Intake (Future)
- [ ] Slack MVP: create session from Slack, route to repo, send status updates
- [ ] Chrome extension: capture DOM context + prompt

### Phase 10: Desktop → Cloud Handoff (Exploration)
- [ ] Investigate taking local desktop workspace state
- [ ] Spawn cloud sandbox with local `.env` + uncommitted changes
- [ ] Snapshot restore flow from desktop context

---

## Milestones

| Milestone | Description | Phases |
|-----------|-------------|--------|
| M1 | Fast Startup | 2.1-2.5 (warm-on-typing + snapshots) |
| M2 | Rich Session Data | 3.1-3.4 (history + artifacts + presence) |
| M3 | UI Parity | 4.1-4.3 (sidebar + action bar + continuity) |
| M4 | Desktop Polish | 5 (status badges + deep links) |
| M5 | Observability | 6 (metrics dashboard) |

## Success Criteria

- [ ] First token in <2s on warm sandbox
- [ ] First token in <10s on cold start with snapshot restore
- [ ] Sessions re-open with full conversation context
- [ ] Users can view PR/preview without leaving session
- [ ] Sandbox spawn failures auto-recover without user intervention

## Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Snapshot build cost | Start with top 5 repos, expand based on usage |
| Warm-on-typing false positives | Debounce aggressively (500ms+) |
| Stale snapshots (>30 min old) | Delta sync handles recent commits |
| Modal cold start latency | Snapshots + restore should help |
| Security for preview embedding | Sandbox network isolation, CSP headers |

## Key Files

- `packages/control-plane/src/session/durable-object.ts` - Session DO
- `packages/control-plane/src/types.ts` - Type definitions
- `packages/sandbox/app.py` - Modal sandbox
- `apps/web/src/app/cloud/[sessionId]/hooks/useCloudSession.ts` - WebSocket hook
- `apps/web/src/app/cloud/[sessionId]/components/CloudWorkspaceContent/` - Session UI

## Commands

```bash
# Deploy control plane
cd packages/control-plane && wrangler deploy

# Deploy sandbox
modal deploy packages/sandbox/app.py

# Run web app
bun dev --filter=web

# Local dev with ngrok
ngrok http 3001 --domain=your-domain.ngrok-free.app
```
