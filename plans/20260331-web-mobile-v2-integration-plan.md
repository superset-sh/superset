# Web Mobile V2 Alignment Plan

Goal: keep the new web mobile UI, but move it onto the same workspace/session shape as desktop v2.

## Principles
- Web is workspace-first.
- Sessions are scoped to `v2WorkspaceId`.
- Route components stay mostly presentational.
- Shared chat/runtime logic should live in shared packages, not a web-only stack.

## Phase 1: Route And UI Alignment
Status: in progress

- Keep the current mobile UI and mock-backed behavior.
- Use `/agents` as the current workspace screen.
- Use agent-scoped routes for the active workspace flow:
  - `/agents`
  - `/agents/workspace/[workspaceId]`
- Do not encode session identity in the route.
- Keep workspace selection at the route level and keep session selection in UI state.
- Pass workspace/session data into components instead of letting components resolve global mock state.
- Remove legacy session-only routing and compatibility shims.

Exit criteria:
- No `/[sessionId]` web route remains.
- There is no raw `/workspace` route.
- `/agents` is the current-workspace sessions screen.
- `/agents/workspace/[workspaceId]` is the workspace detail route.
- The current UI still works with mock data.

## Phase 2: Backend Contract Alignment
Status: next

- Add a web-safe `viewer` device ensure path.
- Expose the v2 workspace and session reads the web flow needs.
- Standardize session creation and lookup on `v2WorkspaceId`.
- Retire or adapt any legacy bootstrap path that only understands `workspaceId`.

Exit criteria:
- Web can resolve a real v2 workspace.
- Web can list and load sessions by `v2WorkspaceId`.

## Phase 3: Replace Mock Data With Controllers
Status: next

- Add workspace and session controllers for the web route tree.
- Move grouping, filtering, and selection logic into those controllers.
- Stop reading `mock-data.ts` from user-facing routes.

Exit criteria:
- Landing and session pages render real workspace/session data.
- Presentational components stay thin.

## Phase 4: Real Composer And Shared Chat Runtime
Status: later

- Wire the composer to real session creation and send flows.
- Reuse shared chat client/runtime pieces where possible.
- Keep web-specific state local to the route and component layer.

Exit criteria:
- Web can create a session and send messages.
- Chat rendering behavior is shared with desktop where it should be.

## Phase 5: Diff And Session Parity
Status: later

- Drive the diff tab from real session output.
- Match desktop session ordering semantics with real `lastActiveAt`.
- Add loading, empty, and not-found states that reflect real runtime behavior.

Exit criteria:
- Session list behavior matches desktop v2 expectations.
- Diff is no longer static preview data.
