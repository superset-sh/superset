# Cloud Workspaces Integration Plan

## Status: Sprint 1 Complete

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

## Pending - Sprint 2 (Chat Polish)

Reference: `temp_modal_vibe/background-agents` - ColeMurray's Open-Inspect

### Phase 5: Tool Call Display (Priority: High) ⬅️ START HERE
Currently tool calls render as raw JSON. Need collapsible UI with icons.

**Reference files:**
- `background-agents/packages/web/src/lib/tool-formatters.ts`
- `background-agents/packages/web/src/components/tool-call-item.tsx`
- `background-agents/packages/web/src/components/tool-call-group.tsx`

**Components to create in `apps/web/src/app/cloud/[sessionId]/components/`:**
- [ ] `tool-formatters.ts` - Format tool calls with summary + icon
  ```typescript
  interface FormattedToolCall {
    toolName: string;
    summary: string;  // e.g., "filename.tsx (42 lines)"
    icon: string;     // "file" | "pencil" | "terminal" | "search" | "folder"
    getDetails: () => { args?: Record<string, unknown>; output?: string };
  }
  ```
  - Read: `filename.tsx (42 lines)`
  - Edit/Write: `filename.tsx`
  - Bash: `npm install...` (truncate to 50 chars)
  - Grep: `"pattern" (5 matches)`
  - Glob: `*.tsx (12 files)`
  - Task: `description` (truncate to 40 chars)

- [ ] `ToolCallItem/` - Collapsible item with chevron + icon + summary + time
- [ ] `ToolCallGroup/` - Groups consecutive same-type tool calls
- [ ] `ToolIcon/` - SVG icons for each tool type

**UI pattern:**
```
▶ Read filename.tsx (42 lines)        10:32
▶ Edit package.json                    10:32
▼ Bash npm install                     10:33
  └─ Arguments: { command: "npm install" }
  └─ Output: [truncated output]
```

### Phase 6: Token Streaming Improvements (Priority: High)
Background-agents pattern: Accumulate tokens, display only on execution_complete.

**In `useCloudSession.ts`:**
- [ ] Add `pendingTextRef` to accumulate streaming tokens
- [ ] On `token` event: Store in ref, don't render yet
- [ ] On `execution_complete`: Flush pending text to events, then add complete event
- [ ] On `stop`: Preserve partial content from pendingTextRef

### Phase 7: Markdown Rendering (Priority: Medium)
Currently using `<pre>` for all assistant text.

- [ ] Use `react-markdown` with `remark-gfm`
- [ ] Code block syntax highlighting (shiki or rehype-highlight)
- [ ] Copy button for code blocks
- [ ] Support: headings, lists, tables, blockquotes, inline code

### Phase 8: Processing & Connection States (Priority: Medium)
Reference: `background-agents/packages/web/src/hooks/use-session-socket.ts`

**States to track in hook:**
- [ ] `isProcessing` - Show when prompt being executed
- [ ] `sandboxStatus` - warming/spawning/ready/running/failed
- [ ] Reconnect attempt counter with display
- [ ] Auth error handling (close codes 4001, 4002)

**UI feedback:**
- [ ] Pulsing indicator when isProcessing
- [ ] Sandbox status badge with colors (warming=yellow, ready=green, failed=red)
- [ ] "Reconnecting (attempt 2/5)" message on disconnect
- [ ] "Session expired" error with reconnect button

### Phase 9: WebSocket Hook Improvements (Priority: Medium)
Add background-agents patterns to `useCloudSession.ts`:

- [ ] `sendTyping()` - Trigger sandbox warming on input focus
- [ ] Better close code handling (4001=auth required, 4002=session expired)
- [ ] `connectionError` state separate from general `error`
- [ ] `reconnect()` function to manually trigger reconnection
- [ ] Clear token on auth errors to force re-fetch

## Pending - Sprint 3 (GitHub Integration)

### Phase 10: GitHub Repo Connection (Priority: High)
User needs to connect GitHub repos in the app.

**Current state:** Have `repository.create` tRPC but no GitHub fetch flow

**Flow to implement:**
1. [ ] Check existing GitHub integration in `packages/trpc/src/router/github/`
2. [ ] Add "Connect Repository" button in `/cloud/new` page
3. [ ] Dialog/sheet to show user's GitHub repos
4. [ ] Fetch repos via GitHub API (user token from auth)
5. [ ] Save selected repos to organization via `repository.create`

### Phase 11: Quick Repo Selector on Home Page (Priority: Medium)
Add repo dropdown to home page for quick session creation.

- [ ] Repository dropdown above/beside the prompt input
- [ ] Flow: select repo → type prompt → create session → redirect → send prompt
- [ ] Recent repos as quick-select chips

### Phase 12: Branch Management (Priority: Low)
- [ ] Fetch branches via GitHub API
- [ ] Branch selector in new session form
- [ ] Show repo's default branch

## Pending - Sprint 4 (Layout & Polish)

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

### Phase 15: Session Lifecycle
- [ ] Delete session
- [ ] Session title editing (inline)
- [ ] Session archiving

### Phase 16: Keyboard Shortcuts
- [ ] `⌘+Enter` to send prompt
- [ ] `Escape` to stop execution
- [ ] `⌘+K` to focus input
- [ ] `⌘+\` to toggle sidebar

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
