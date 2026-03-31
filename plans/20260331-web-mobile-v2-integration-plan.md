# Web Mobile to Desktop V2 Integration Plan

This is the source-of-truth plan for moving the new web mobile agents experience onto the same product and data model direction as desktop v2.

## Status
- Owner: web + platform/chat
- Scope: web mobile agents experience
- Last updated: 2026-03-31

## Problem Statement

The new web mobile agents UI is visually aligned with the product, but it is not integrated like desktop v2.

Today:
- the web route tree is session-first and mock-backed
- the prompt composer is intentionally disabled
- session list, chat transcript, and diff view all read from local mock data
- web does not currently resolve or create a real v2 workspace

Desktop v2 already uses a stronger architecture:
- route identity is a real `workspaceId`
- chat sessions are scoped to `chatSessions.v2WorkspaceId`
- UI components are driven by controller hooks instead of embedded mock state
- device-local view state is kept local, while shared session/workspace state is remote

The goal is not to port desktop panes to web. The goal is to make web mobile operate on the same workspace/session model, so both surfaces feel like the same product.

## Current State

### Web mobile
- `apps/web/src/app/(agents)/page.tsx` renders the prompt input and session list, but both are preview-only.
- `apps/web/src/app/(agents)/[sessionId]/page.tsx` resolves a session from `mock-data.ts`.
- `apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx` renders a disabled `PromptInput`.
- `apps/web/src/app/(agents)/components/SessionList/SessionList.tsx` groups and filters mock sessions locally.
- `apps/web/src/app/(agents)/[sessionId]/components/SessionChat/SessionChat.tsx` and `SessionDiff.tsx` render mock messages and diffs.

### Desktop v2
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx` resolves a real v2 workspace from collections.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/WorkspaceChat.tsx` is a thin shell over a controller.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatController/useWorkspaceChatController.ts` owns session creation, deletion, selection, and session scoping.
- `packages/trpc/src/router/chat/chat.ts` already supports `createSession`, `deleteSession`, `updateSession`, and attachment upload for v2 chat sessions.
- `packages/db/src/schema/schema.ts` already models `chatSessions.v2WorkspaceId`.

### Known integration gaps
- The browser chat bootstrap route at `apps/api/src/app/api/chat/[sessionId]/route.ts` only accepts legacy `workspaceId`, not `v2WorkspaceId`.
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts` requires a `deviceId` when creating a v2 workspace.
- `packages/trpc/src/router/device/device.ts` exposes `ensureV2Host`, but there is no equivalent helper for a web `viewer` device.
- Web does not currently consume `@superset/chat` or `@superset/workspace-client`, even though both packages contain reusable client/runtime pieces.

## Goals
- Move web mobile from mock sessions to real v2 workspace-scoped sessions.
- Keep the current mobile-first UI direction and touch behavior.
- Reuse the same chat/session model as desktop v2.
- Reuse shared client/runtime code where practical instead of creating another app-specific chat stack.
- Keep device-local mobile UI state local and lightweight.

## Non-Goals
- Do not bring desktop pane layout or VS Code-like group management to web mobile.
- Do not make web depend on desktop-only local storage collections or Electron paths.
- Do not redesign the mobile UI from scratch.
- Do not block on full desktop parity for file trees, terminals, or browser panes.

## Locked Decisions

### 1. Web should become workspace-first, not remain session-first

The web agents experience should route through a real v2 workspace identity. The recommended route shape is:

- `/agents/[workspaceId]`
- `/agents/[workspaceId]/[sessionId]`

Reason:
- desktop v2 is already organized around `workspaceId`
- `chatSessions` are scoped by `v2WorkspaceId`
- future file/diff/runtime integrations will need workspace identity anyway

### 2. Keep the current web components as presentational shells

The current web components are directionally correct:
- `PreviewPromptComposer`
- `ResponsiveDropdown`
- `SessionList`
- `SessionChat`
- `SessionDiff`

They should stay focused on rendering and receive real data/actions from controller hooks.

### 3. Use the web app's existing Next.js + tRPC + React Query stack for state access

Web already has a stable provider stack:
- `apps/web/src/trpc/react.tsx`
- `apps/web/src/app/providers.tsx`

The first integration pass should stay inside that model instead of copying desktop's Electric collection layer.

### 4. Standardize new web session creation on v2 chat session APIs

New web work should use the v2 session path:
- `chat.createSession({ sessionId, v2WorkspaceId })`

The legacy browser bootstrap route should either:
- be extended to accept `v2WorkspaceId`, or
- be avoided for new web flows in favor of tRPC/session runtime clients

### 5. Add a web viewer-device identity

Web should not impersonate a host device.

The v2 model already supports `viewer` device type. Add a web-safe device ensure path, for example:
- `device.ensureV2Viewer({ clientId, name })`

This becomes the canonical identity used when web creates or claims a v2 workspace record.

### 6. Shared chat runtime logic belongs in `packages/chat`

There is already reusable client code in:
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`
- `packages/chat/src/client/provider/client.ts`

Web should prefer adopting and extending those shared pieces instead of creating a third independent chat runtime implementation.

## Target Architecture

### Route model
- A workspace route resolves the selected v2 workspace.
- A session route resolves a chat session within that workspace.
- The session route owns the active `chat` vs `diff` tab state locally.

### Data model
- v2 project: source repository identity
- v2 workspace: selected repo/branch/device context
- chat session: scoped to `v2WorkspaceId`

### UI/controller split
- page/layout: route resolution, auth, feature gating
- controller hooks: workspace lookup, session list, session lifecycle, composer actions
- presentational components: headers, selectors, composer, chat list, diff list

### Local-only state
- active tab (`chat` or `diff`)
- search query
- dropdown/drawer open state
- draft input
- temporary optimistic UI state

### Remote/shared state
- v2 projects
- v2 workspaces
- chat sessions
- chat messages
- generated diffs / changed files metadata

## Implementation Phases

## Phase 0: Define the integration seam

### Deliverables
- Decide final web route shape
- Decide whether web creates fresh v2 workspaces or selects existing ones first
- Decide whether the first integrated release is read-only or supports sending messages

### Acceptance
- One canonical flow exists for `repo + branch + workspace + session`
- No new web-only workspace/session schema is introduced

## Phase 1: Fill backend contract gaps

### Work
- Add `device.ensureV2Viewer` to `packages/trpc/src/router/device/device.ts`
- Add read procedures for v2 workspace/project browsing if missing from current API surface
- Extend `apps/api/src/app/api/chat/[sessionId]/route.ts` to accept `v2WorkspaceId`, or explicitly retire it for the new web flow
- Add any missing session list/read helpers needed by web

### Acceptance
- Web can identify itself as a valid v2 viewer device
- Web can create or resolve a v2 workspace without legacy workspace shims
- Web can create/read/delete chat sessions against `v2WorkspaceId`

## Phase 2: Introduce web workspace/session controllers

### Work
- Replace `mock-data.ts` as the source of truth
- Add a workspace-aware controller for the web landing screen
- Add a session-aware controller for the web session detail screen
- Move search, grouping, and session actions behind controller outputs

### Suggested file shape
- `apps/web/src/app/(agents)/components/...` remains presentational
- add route-local hooks like:
  - `hooks/useAgentsWorkspaceController`
  - `hooks/useAgentsSessionController`
  - `hooks/useAgentsChatDisplay`

### Acceptance
- The landing screen renders real sessions for a real workspace
- The session detail screen loads a real session by route params
- No web route depends on `mockSessions`, `mockMessages`, or `mockDiffFiles`

## Phase 3: Wire the composer and session lifecycle

### Work
- Turn `PreviewPromptComposer` into a real composer or replace it with a thin wrapper around the real input flow
- Reuse shared prompt/chat primitives already used by desktop
- Create session on first send if no session exists
- Persist title updates and attachment uploads through shared chat APIs

### Acceptance
- Web can create a real session and send a message
- Attachments upload through shared APIs
- Session titles and last-active ordering update from real data

## Phase 4: Reuse shared chat runtime pieces

### Work
- Add `@superset/chat` to `apps/web` if needed
- Use `createChatRuntimeServiceHttpClient(...)` where it fits the web transport model
- Reuse `useChatDisplay(...)` or extract any remaining desktop-specific assumptions into shared helpers

### Acceptance
- Web and desktop are not maintaining separate chat display logic for the same behavior
- Optimistic message rendering, assistant streaming, and error handling follow the same shared rules

## Phase 5: Diff and session parity polish

### Work
- Drive the web diff tab from real changed-file or tool-output data
- Match desktop session grouping semantics more closely by using `lastActiveAt` instead of simple `createdAt` buckets
- Add empty, loading, and not-found states that reflect real runtime behavior

### Acceptance
- Web session list behavior matches desktop v2 expectations
- Diff tab reflects real session output, not a static preview

## Recommended File Changes

### Backend
- `packages/trpc/src/router/device/device.ts`
- `packages/trpc/src/router/chat/chat.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `apps/api/src/app/api/chat/[sessionId]/route.ts`

### Web app
- `apps/web/src/app/(agents)/page.tsx`
- `apps/web/src/app/(agents)/[sessionId]/page.tsx`
- `apps/web/src/app/(agents)/mock-data.ts` or delete entirely after migration
- `apps/web/src/app/(agents)/components/AgentPromptInput/AgentPromptInput.tsx`
- `apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx`
- `apps/web/src/app/(agents)/components/SessionList/SessionList.tsx`
- `apps/web/src/app/(agents)/[sessionId]/components/SessionPageContent/SessionPageContent.tsx`
- `apps/web/src/app/(agents)/[sessionId]/components/SessionChat/SessionChat.tsx`
- `apps/web/src/app/(agents)/[sessionId]/components/SessionDiff/SessionDiff.tsx`

### Shared packages
- `packages/chat/src/client/...`

## Verification Checklist
- [ ] Web routes resolve a real v2 workspace
- [ ] Web can list real sessions scoped to `v2WorkspaceId`
- [ ] Web can create a session and send a message
- [ ] Web can upload at least one attachment
- [ ] Web session list ordering uses real `lastActiveAt`
- [ ] Web session detail renders real messages
- [ ] Web diff tab renders real session-derived file changes
- [ ] No user-facing web agents screen depends on `mock-data.ts`

## Risks

### Risk: web ends up on a parallel workspace model
Mitigation:
- require all new web session flows to resolve a real v2 workspace id

### Risk: browser session bootstrap continues using legacy `workspaceId`
Mitigation:
- extend the HTTP route to understand `v2WorkspaceId` or stop using that route for new web flows

### Risk: v2 workspace creation semantics are too host-oriented for web
Mitigation:
- add a first-class viewer-device path instead of reusing host device identity

### Risk: desktop and web chat rendering drift again
Mitigation:
- move common display/runtime behavior into `packages/chat`

## Open Questions
- Should the first integrated web release create a new v2 workspace from repo/branch, or only attach to an existing workspace?
- Should web mobile support browsing multiple workspaces on day one, or just one current workspace context?
- What is the minimum real data needed for the diff tab in v1: changed files only, or full file diff payloads?
- Should web session creation remain feature-flagged until the viewer-device and v2 bootstrap path are fully stable?

## Recommended First Cut

If we want the fastest path that still aligns with desktop v2:

1. add `ensureV2Viewer`
2. add a workspace-scoped web route
3. load real sessions from `chatSessions.v2WorkspaceId`
4. keep the existing mobile UI
5. wire real send/create session behavior
6. leave advanced diff/file/runtime features for follow-up work

That gets web mobile onto the same product rails as desktop v2 without importing desktop-only complexity.
