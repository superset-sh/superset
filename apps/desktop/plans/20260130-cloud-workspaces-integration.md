# Cloud Workspaces Integration Plan

> **⚠️ SUPERSEDED**: This plan has been consolidated into `20260131-cloud-parity-plan.md`. See that file for the current roadmap.

## Status: Sprint 4 Complete - Consolidated into Parity Plan

## Completed

### Infrastructure
- [x] Control Plane (Cloudflare Workers) - Deployed to `https://superset-control-plane.avi-6ac.workers.dev`
  - Session Durable Objects with SQLite storage
  - WebSocket support for real-time events
  - REST API for session management
  - HMAC token auth for Modal
  - **Chat history persistence** - sends last 100 messages + 500 events on client subscribe
- [x] Modal Sandbox (Python) - Deployed
  - Sandbox execution environment
  - Git clone and branch management
  - Claude Code CLI execution
  - Event streaming to control plane
- [x] Database schema (`packages/db/src/schema/cloud-workspaces.ts`)
- [x] tRPC router (`packages/trpc/src/router/cloud-workspace/`)

### Desktop App
- [x] Desktop sidebar - Cloud workspaces section
- [x] Desktop CloudWorkspaceView - WebView embedding web app

### Web App - Phase 1-4 Complete
- [x] **Phase 1: Chat History Persistence**
  - Control plane sends historical messages/events on subscribe
  - Web hook handles `history` message type
  - Events prepopulated on reconnect

- [x] **Phase 2: Home Page & Session List**
  - `/cloud` landing page with welcome message
  - Session sidebar with search/filter
  - Active/Inactive session grouping (7-day threshold)
  - Relative time display
  - New Session button

- [x] **Phase 3: New Session Flow**
  - `/cloud/new` page with form
  - Repository selection dropdown
  - Title input (optional)
  - Model selection (Sonnet 4, Opus 4, Haiku 3.5)
  - Base branch input
  - Form validation and error handling
  - tRPC mutation integration

- [x] **Phase 4: User Messages Display**
  - User messages shown in conversation
  - Different styling for user vs assistant messages
  - User messages added to event stream when sent

### PR
- [x] PR created: https://github.com/superset-sh/superset/pull/1082

## Architecture: Bridge Pattern

Based on [ColeMurray/background-agents](https://github.com/ColeMurray/background-agents) and [Ramp's blog post](https://builders.ramp.com/post/why-we-built-our-background-agent):

### Data Flow
```
User → Web App → Control Plane (WebSocket) → Sandbox (WebSocket) → Claude
                       ↑                           ↓
                       └────── Events ─────────────┘
```

### Key Files
- `packages/control-plane/src/session/durable-object.ts` - Session DO with SQLite, history, events
- `packages/control-plane/src/types.ts` - Type definitions including HistoricalMessage
- `packages/sandbox/app.py` - Modal sandbox with Claude CLI execution
- `apps/web/src/app/cloud/page.tsx` - Cloud home page
- `apps/web/src/app/cloud/new/page.tsx` - New session page
- `apps/web/src/app/cloud/[sessionId]/page.tsx` - Session detail page
- `apps/web/src/app/cloud/[sessionId]/hooks/useCloudSession.ts` - WebSocket hook with history
- `apps/web/src/app/cloud/[sessionId]/components/CloudWorkspaceContent/` - Session UI

## Completed - Sprint 2 (Chat Polish)

Reference: `temp_modal_vibe/background-agents` - ColeMurray's Open-Inspect

### Phase 5: Tool Call Display ✅
- [x] `lib/tool-formatters.ts` - Format tool calls with summary + icon
- [x] `ToolCallItem/` - Collapsible item with chevron + icon + summary + time
- [x] `ToolCallGroup/` - Groups consecutive same-type tool calls
- [x] `ToolIcon/` - SVG icons for each tool type

### Phase 6-8: Processing & Connection States ✅
- [x] `isProcessing` state - tracks when prompt being executed
- [x] `isSandboxReady` computed from sandboxStatus
- [x] Auto-spawn sandbox when status is "stopped"
- [x] Disable input when sandbox not ready (syncing/spawning)
- [x] Dynamic placeholder text based on state
- [x] Processing indicator ("Claude is working...")
- [x] Sandbox status badge with spawning state

### Phase 7: Markdown Rendering ✅
- [x] `react-markdown` with `remark-gfm`
- [x] Custom code block styling
- [x] Inline code styling

### Phase 9: WebSocket Hook Improvements ✅
- [x] `isReconnecting` state
- [x] `reconnectAttempt` counter (shown as "Reconnecting (2/5)...")
- [x] Error message when max reconnects exceeded

## Completed - Sprint 3 (GitHub Integration)

### Phase 10: GitHub Repo Connection ✅
- [x] Updated `/cloud/new` page to fetch GitHub installation status
- [x] Updated `/cloud/new` page to fetch GitHub repositories via `integration.github.listRepositories`
- [x] Show "Connect GitHub" CTA when GitHub not connected or suspended
- [x] Repository selector shows GitHub repos with private indicator (lock icon)
- [x] Auto-set base branch to repo's default branch on selection

### Phase 11: Quick Repo Selector on Home Page ✅
- [x] Repository dropdown above the prompt input on `/cloud` home page
- [x] Flow: select repo → type prompt → create session → redirect
- [x] Recent repos as quick-select chips
- [x] GitHub connect CTA when no installation

## Completed - Sprint 4 (Layout & Polish)

### Phase 15: Session Lifecycle ✅
- [x] Inline session title editing (click to edit, Enter to save, Escape to cancel)
- [x] Session archiving via dropdown menu
- [x] tRPC mutations for update/archive already existed

### Phase 16: Keyboard Shortcuts ✅
- [x] `⌘+Enter` to send prompt (global)
- [x] `Escape` to stop execution
- [x] `⌘+K` to focus input
- [x] `⌘+\` to toggle sidebar

## Pending

### Phase 17: Sandbox Warm-up Optimization (Priority: High)
Reference: Ramp's background-agents approach - warm sandbox while user types

**Warm-up During Typing:**
- [ ] Add `typing` message type to WebSocket protocol
- [ ] Send typing indicator when user starts typing in prompt input (debounced)
- [ ] Control plane spawns sandbox on first typing event if not already running
- [ ] Broadcast `sandbox_warming` status to show UI feedback

**Implementation in CloudWorkspaceContent.tsx:**
```typescript
// Debounced typing handler
const handleInputChange = (value: string) => {
  setPromptInput(value);
  if (value.length > 0 && !isSandboxReady && !isSpawning) {
    sendTypingIndicator(); // Triggers early spawn
  }
};
```

**Control Plane Changes (durable-object.ts):**
- [ ] Add `handleTyping()` method to spawn sandbox proactively
- [ ] Avoid duplicate spawns with `isSpawningSandbox` flag

### Phase 18: Snapshot/Restore for Fast Startup (Priority: Medium)
Reference: Ramp rebuilds repo images every 30 minutes

- [ ] Modal scheduler to create periodic repo snapshots
- [ ] Store snapshot IDs in database per repository
- [ ] Restore from snapshot instead of full git clone
- [ ] Only sync changes since snapshot (faster startup)

### Phase 19: Home Page Quick Start (Priority: Medium)
Improve the flow from home page to active session:

- [ ] Pre-warm sandbox when repo is selected (before prompt submission)
- [ ] Show sandbox status indicator on home page
- [ ] Optimistic redirect - navigate immediately, show syncing state in session view
- [ ] Initial prompt auto-sent after sandbox ready

### Phase 12: Branch Management (Priority: Low)
- [ ] Fetch branches via GitHub API
- [ ] Branch selector in new session form
- [ ] Show repo's default branch

### Phase 13: Right Sidebar (Session Details)
- [ ] Session metadata: model, created time, duration
- [ ] Sandbox status with real-time updates
- [ ] Repository info with GitHub link
- [ ] PR link when created (from artifacts)
- [ ] Files changed (aggregate from tool calls)

### Phase 14: Artifacts System (Priority: Low)
Reference: background-agents stores PRs as artifacts

- [ ] Artifact type: PR with state (open/merged/closed/draft)
- [ ] Display PR badge in sidebar
- [ ] Link to GitHub PR
- [ ] Screenshot artifacts (future)

## Test Results
- [x] Control plane health check: Working
- [x] Session creation: Working
- [x] Session state retrieval: Working
- [x] Event storage and retrieval: Working
- [x] Modal sandbox health: Working
- [x] Sandbox spawning: Working
- [x] Git clone in sandbox: Working
- [x] Branch checkout: Working
- [x] Events streaming to control plane: Working
- [x] Bridge connection: Working
- [x] Prompt execution with Claude: Working
- [x] Chat history on reconnect: Working

## Environment Variables
```
NEXT_PUBLIC_CONTROL_PLANE_URL=https://superset-control-plane.avi-6ac.workers.dev
```

## Pending - Developer Experience

### Local Development with GitHub OAuth
GitHub OAuth callbacks require a public URL. Use ngrok with a static domain for local development.

- [ ] Document ngrok setup in README/CONTRIBUTING
- [ ] Reserve static ngrok domain (e.g., `superset-dev.ngrok-free.app`)
- [ ] Add `.env.example` entry for ngrok URL

**Setup steps:**
1. Sign up at ngrok.com, claim free static domain in Dashboard → Domains
2. Run: `ngrok http 3001 --domain=your-domain.ngrok-free.app`
3. Set in `.env`: `NEXT_PUBLIC_API_URL=https://your-domain.ngrok-free.app`
4. Click "Connect GitHub" from localhost:3000 - callbacks will work

## Commands
```bash
# Deploy control plane
cd packages/control-plane && wrangler deploy

# Deploy sandbox
modal deploy packages/sandbox/app.py

# Run web app
bun dev --filter=web

# Spawn sandbox for testing
curl -X POST "https://superset-control-plane.avi-6ac.workers.dev/api/sessions/{sessionId}/spawn-sandbox"
```
