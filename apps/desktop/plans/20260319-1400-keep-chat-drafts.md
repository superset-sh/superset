# Keep Chat Drafts Across Tab and Workspace Switches

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

When a user types a message in the chat textarea and switches to another tab or workspace, the typed text is lost. After this change, the text is preserved. If they switch back, their draft is still there. The draft is cleared only when they send a message or switch to a different chat session within the same tab.

To see it working: type some text in a chat tab, click another tab, click back — the text is still there.

## Assumptions

- `ChatPaneInterface` unmounts on tab switch. **Confirmed**: `TabsContent/index.tsx` renders only the active tab's `TabView` — no keep-alive or CSS hiding. Previous tab's component tree is fully unmounted.
- The v2 `WorkspaceChatInterface` at `routes/_authenticated/_dashboard/v2-workspace/…/WorkspaceChatInterface/` uses a different controller (`useWorkspaceChatController`) with no `paneId` concept and no tabs store backing. Draft preservation for that component is **out of scope**.

## Open Questions

None — all questions resolved during design. See Decision Log.

## Progress

- [ ] Write `DraftSaver` component
- [ ] Add `paneId` to `ChatPaneInterfaceProps` and pass it from `ChatPane.tsx`
- [ ] Wire `DraftSaver` into `ChatPaneInterface`
- [ ] Add `isSendingRef` and clear draft on all send paths
- [ ] Add session-change effect with initial-mount guard
- [ ] Run typecheck and lint
- [ ] Manual smoke test

## Surprises & Discoveries

*(to be filled during implementation)*

## Decision Log

- Decision: Use `setChatLaunchConfig` (existing store action) rather than adding a new `setChatDraft` action.
  Rationale: `setChatLaunchConfig` already does exactly what's needed — it writes `pane.chat.launchConfig` to the persisted Zustand store. Adding a parallel action would be redundant.
  Date/Author: 2026-03-19

- Decision: Read `launchConfig` from `useTabsStore.getState()` at call time rather than closing over it.
  Rationale: `setChatLaunchConfig` replaces the entire `launchConfig` object (no internal merge). Closing over the prop would spread a stale snapshot, corrupting fields like `model` or `initialFiles`. Reading from the store at call time always produces a current value.
  Date/Author: 2026-03-19

- Decision: Use an `isSendingRef` guard in `DraftSaver` to skip save on unmount after a send.
  Rationale: After a send, `clearInput()` is called but React commits the state update asynchronously. If the user switches tabs before the commit, `textRef.current` still holds the sent text. The guard prevents the just-sent message from being written back as a draft.
  Date/Author: 2026-03-19

- Decision: Guard the session-change `useEffect` against initial mount with a `sessionInitializedRef`.
  Rationale: Without the guard, the effect fires on first mount and immediately writes `draftInput: undefined` back to the store, erasing the draft that was just consumed by `PromptInputProvider` on mount.
  Date/Author: 2026-03-19

- Decision: v2 `WorkspaceChatInterface` is out of scope.
  Rationale: It uses a different controller with no `paneId` — applying the same pattern would require a different mechanism. Keeping scope focused.
  Date/Author: 2026-03-19

## Outcomes & Retrospective

*(to be filled at completion)*

## Context and Orientation

This is a change to the **desktop app** (`apps/desktop/`).

**Key terms:**
- **Zustand store**: A state management library. The tabs store lives at `apps/desktop/src/renderer/stores/tabs/store.ts` and is persisted to disk (via Electron's local storage). State in Zustand survives component unmounts.
- **`PromptInputProvider`** (`packages/ui/src/components/ai-elements/prompt-input.tsx`): A React context provider that holds the chat textarea's current text in `useState`. Because it's React state, it's lost when the component unmounts.
- **`ChatPaneInterface`** (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/ChatPaneInterface.tsx`): The main chat UI component (~1000 lines). It renders `<PromptInputProvider initialInput={initialLaunchConfig?.draftInput}>` — meaning if `draftInput` is in the store when the component mounts, the textarea is pre-filled.
- **`ChatLaunchConfig`** (`apps/desktop/src/shared/tabs-types.ts`, line 147): A type that already has a `draftInput?: string` field. The plumbing to restore a draft on mount already exists — what's missing is saving the draft to the store before unmount.
- **`setChatLaunchConfig(paneId, launchConfig)`** (tabs store, `store.ts` line 1989): Replaces `pane.chat.launchConfig` in the persisted store. Does a full replacement, not a merge — callers must spread the current config when updating only one field.

**The gap**: Nothing currently saves the textarea text to the store when the user switches away. `DraftSaver` closes this gap.

**Files involved:**

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/
    ├── ChatPane.tsx                          — passes props to ChatPaneInterface; will add paneId
    └── ChatPaneInterface/
        ├── types.ts                          — ChatPaneInterfaceProps; will add paneId field
        ├── ChatPaneInterface.tsx             — main component; will add DraftSaver + effects
        └── components/
            └── DraftSaver/                   — NEW
                ├── DraftSaver.tsx
                └── index.ts

## Plan of Work

### Step 1: Create `DraftSaver` component

Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/components/DraftSaver/DraftSaver.tsx`.

This component has one job: on unmount, save the current textarea text to the tabs store as `draftInput`. It must be rendered **inside** `<PromptInputProvider>` so it can access `usePromptInputController()`.

It receives two props:
- `paneId: string` — identifies which pane to write to in the store
- `isSendingRef: React.RefObject<boolean>` — set to `true` by the parent when a send is dispatched; tells `DraftSaver` not to save (the send cleared the textarea, but React may not have committed yet)

It uses two refs (`textRef`, `paneIdRef`) so the unmount cleanup function always reads the latest values without needing to re-register the effect on every render.

Inside the single cleanup effect (empty dependency array — intentional), it reads the current `launchConfig` from `useTabsStore.getState()` at unmount time, then calls `setChatLaunchConfig` with the draft merged in.

Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/components/DraftSaver/index.ts` as a barrel export.

### Step 2: Add `paneId` to `ChatPaneInterfaceProps`

In `ChatPaneInterface/types.ts`, add `paneId: string` as a required field to `ChatPaneInterfaceProps`.

### Step 3: Thread `paneId` from `ChatPane.tsx`

In `ChatPane.tsx`, `paneId` is already available (it's one of the props received by `ChatPane`). Pass it as `paneId={paneId}` to `<ChatPaneInterface>`.

### Step 4: Update `ChatPaneInterface.tsx`

Four changes in `ChatPaneInterface.tsx`:

**4a. Accept and use `paneId`**: Destructure `paneId` from props.

**4b. Declare `isSendingRef`**: Add `const isSendingRef = useRef(false)` near the other refs.

**4c. Render `DraftSaver`**: Inside `<PromptInputProvider>`, add `<DraftSaver paneId={paneId} isSendingRef={isSendingRef} />` as a sibling of the existing children.

**4d. Clear draft on send**: In `handleSend`, after the successful send (after `captureChatEvent(...)` at line ~632), add:

    isSendingRef.current = true;
    const { panes, setChatLaunchConfig } = useTabsStore.getState();
    const currentConfig = panes[paneId]?.chat?.launchConfig ?? null;
    setChatLaunchConfig(paneId, { ...currentConfig, draftInput: undefined });

Do the same in `restartFromUserMessage` after the successful mutation completes (after `setEditingUserMessageId(null)` at line ~846).

Note: `isSendingRef.current = true` is set before the store write. It does not need to be reset — once a message is sent, there is no draft to preserve.

**4e. Session-change effect**: Add a new `useEffect` that fires when `sessionId` changes (but not on initial mount) and clears `draftInput` from the store:

    const sessionInitializedRef = useRef(false);

    useEffect(() => {
      if (!sessionInitializedRef.current) {
        sessionInitializedRef.current = true;
        return;
      }
      const { panes, setChatLaunchConfig } = useTabsStore.getState();
      const currentConfig = panes[paneId]?.chat?.launchConfig ?? null;
      setChatLaunchConfig(paneId, { ...currentConfig, draftInput: undefined });
    }, [sessionId, paneId]);

This clears the draft when the user switches to a different chat session within the same tab, but not on the initial mount (which would erase the just-restored draft).

## Concrete Steps

After making all edits:

    cd /path/to/repo
    bun run typecheck
    # Expected: No errors

    bun run lint:fix
    # Expected: No lint errors after auto-fix

## Validation and Acceptance

    bun dev
    # Desktop app opens

Manual test:
1. Open a chat tab
2. Type "hello world" in the textarea (do not send)
3. Click a different tab
4. Click back to the original tab
5. Observe: "hello world" is still in the textarea ✓

6. Send the message
7. Switch tabs, switch back
8. Observe: textarea is empty ✓

9. Type "draft text", switch to a different session via the session list
10. Observe: textarea is empty ✓

## Idempotence and Recovery

All edits are additive. If any step fails, revert that file and retry. No database changes or irreversible operations.

## Interfaces and Dependencies

**`DraftSaver` props interface:**

    interface DraftSaverProps {
      paneId: string;
      isSendingRef: React.RefObject<boolean>;
    }

**Updated `ChatPaneInterfaceProps`** (add to existing interface in `types.ts`):

    paneId: string;

**Store access pattern used throughout:**

    const { panes, setChatLaunchConfig } = useTabsStore.getState();
    const currentConfig = panes[paneId]?.chat?.launchConfig ?? null;
    setChatLaunchConfig(paneId, { ...currentConfig, draftInput: value });
