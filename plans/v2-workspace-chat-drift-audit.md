# V2 Workspace Chat Drift Audit

This is a passthrough audit of the current v2 workspace chat implementation against the original desktop `ChatPane` implementation.

Scope compared:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat`

This note only records drift. It does not resolve it.

## Summary

The copied leaf UI is mostly aligned. The meaningful drift is in:
- the top-level wrapper/shell
- the controller/session bootstrapping logic
- slash-command behavior
- file mention search
- model auth/status behavior
- a few removed debug/MCP flows

## Drift To Resolve

### 1. Top-level shell parity is incomplete

Files:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPane.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/WorkspaceChat.tsx`

Current v2 drift:
- The original chat is wrapped in `BasePaneWindow`, pane toolbar actions, split/close handlers, and `TabContentContextMenu`.
- The original dev toolbar includes raw snapshot copy.
- The v2 route version is only a border/header shell plus session selector.

Why it matters:
- This is intentional route-level divergence, but it is still behavioral drift from the original implementation.
- If the goal is strict 1:1 parity, the missing toolbar/dev affordances need an explicit replacement or acceptance.

### 2. Session bootstrap/controller logic is materially simpler than the original

Files:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/hooks/useChatPaneController/useChatPaneController.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatController/useWorkspaceChatController.ts`

Current v2 drift:
- The original controller persists session state through the tabs store; the v2 controller keeps `sessionId` in local component state.
- The original controller handles `launchConfig` and `consumeLaunchConfig`; the v2 controller returns `launchConfig: null` and a no-op `consumeLaunchConfig`.
- The original controller bootstraps missing sessions with `createSessionInitRunner`, retry logic, toasts, and scoped retry cancellation; the v2 controller does a single `createSessionRecord` call.
- The original controller calls `apiTrpcClient.workspace.ensure` when a workspace is missing from the remote collections model; the v2 controller does not.
- The original controller reports session/workspace errors via `reportChatError`; the v2 controller largely swallows errors or only returns them.

Why it matters:
- This is the largest behavioral drift from the original implementation.
- Session lifecycle and launch semantics are not yet parity-complete.

### 3. Raw snapshot/dev-copy behavior was dropped

Files:
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/hooks/useChatRawSnapshot/useChatRawSnapshot.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPane.tsx`

Current v2 drift:
- The old pane keeps the latest raw snapshot for dev copy-to-clipboard.
- The v2 workspace chat does not implement this at all.

Why it matters:
- This is debug/dev-only, but it is still a missing original behavior.

### 4. Slash-command resolution is simplified versus the original

Files:
- `apps/desktop/src/renderer/components/Chat/ChatInterface/hooks/useSlashCommandExecutor/useSlashCommandExecutor.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/hooks/useSlashCommandExecutor/useSlashCommandExecutor.ts`

Current v2 drift:
- The original uses `resolveSlashCommand` from the service and supports action-driven and prompt-driven resolution.
- The v2 copy only implements local built-ins for `/new`, `/clear`, `/stop`, `/model`, and `/mcp`.
- The original supports `resolveSlashPromptResult(...)` and service-defined prompt substitutions; the v2 copy does not.
- Unsupported slash-command actions are surfaced in the original; the v2 version falls back to raw input.

Why it matters:
- This is user-visible behavior drift.
- The copied UI looks the same, but command semantics are not the same.

### 5. File mention search is stubbed out

File:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/components/MentionPopover/MentionPopover.tsx`

Current v2 drift:
- The mention popover returns no files and shows `File search is not available yet.`

Why it matters:
- The old chat affordance exists visually, but the core behavior is not implemented.
- This is one of the clearest parity gaps.

### 6. Model picker auth/status behavior is simplified and effectively hardcoded

File:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/components/ModelPicker/ModelPicker.tsx`

Current v2 drift:
- The copied model picker sets:
  - `isAnthropicAuthenticated={true}`
  - `isOpenAIAuthenticated={true}`
  - all pending flags to `false`
- The old implementation used real auth status and auth dialogs through the old chat client.
- The copied auth dialog/hook subtree was deleted from the v2 copy.

Why it matters:
- The model picker UI is not reflecting actual provider state.
- This can mask configuration problems and differs materially from the original behavior.

### 7. MCP auth flow is no longer real

Files:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/components/WorkspaceChatInterface/hooks/useMcpUi/useMcpUi.ts`
- original MCP flow in the old `ChatPaneInterface` stack

Current v2 drift:
- `authenticateMcpServer` is no longer backed by the original transport/auth flow.
- MCP overview loading exists, but auth/connect behavior is not parity-complete.

Why it matters:
- The MCP UI surface is only partially ported.
- If MCP auth is expected to work in v2 workspace chat, this still needs resolution.

### 8. Session metadata still uses the legacy `/api/chat/:sessionId` REST path

Files:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatController/useWorkspaceChatController.ts`

Current v2 drift:
- Session create/delete still use:
  - `PUT /api/chat/:sessionId`
  - `DELETE /api/chat/:sessionId/stream`

Why it matters:
- This is not drift from the original; it is retained behavior.
- It is worth calling out because the new host-service-backed chat transport is not fully end-to-end yet at the session metadata layer.

## Mostly Aligned

These areas are close to the original and are not the main sources of drift:
- `SessionSelector` visual and behavioral structure
- `ChatPaneInterface` overall layout and message/composer structure
- `useChatDisplay` polling/optimistic-message shape
- message list rendering subtree

## Recommended Resolution Order

1. Controller/session lifecycle parity
2. Slash-command parity
3. File mention search
4. Model auth/status parity
5. MCP auth/connect parity
6. Optional dev/raw snapshot parity
