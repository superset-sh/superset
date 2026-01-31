# Chat Panel Feature (Disabled)

The chat panel UI components exist but are currently disabled. This document describes how to re-enable them.

## Components

The following components are ready but not wired up:

- `src/renderer/screens/main/components/TopBar/ChatPanelControl/` - Toggle button for chat panel
- `src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/ChatPanel/` - Chat panel with resizable container and input
- `src/renderer/stores/chat-panel-state.ts` - Zustand store for panel open/close state

## How to Re-enable

### 1. Export the store

In `src/renderer/stores/index.ts`, uncomment:
```ts
export * from "./chat-panel-state";
```

### 2. Add the hotkey

In `src/shared/hotkeys.ts`, add after `TOGGLE_SIDEBAR`:
```ts
TOGGLE_CHAT_PANEL: defineHotkey({
  keys: "meta+l",
  label: "Toggle Chat Panel",
  category: "Layout",
}),
```

### 3. Add TopBar button

In `src/renderer/screens/main/components/TopBar/index.tsx`:
```tsx
import { ChatPanelControl } from "./ChatPanelControl";

// In the JSX, after <SidebarControl />:
<ChatPanelControl />
```

### 4. Add keyboard shortcut handler

In `src/renderer/screens/main/index.tsx`:
```tsx
import { useChatPanelStore } from "renderer/stores/chat-panel-state";

// In MainScreen component:
const { togglePanel: toggleChatPanel } = useChatPanelStore();

// Add hotkey handler after TOGGLE_SIDEBAR:
useAppHotkey(
  "TOGGLE_CHAT_PANEL",
  () => {
    if (isWorkspaceView) toggleChatPanel();
  },
  undefined,
  [toggleChatPanel, isWorkspaceView],
);
```

### 5. Add chat panel to workspace view

In `src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx`:
```tsx
import { ResizablePanel, ResizablePanelGroup } from "@superset/ui/resizable";
import { ChatPanelResizable } from "./ChatPanel";

// Replace the return statement:
return (
  <ResizablePanelGroup direction="horizontal" className="flex-1 h-full">
    <ResizablePanel defaultSize={70} minSize={30}>
      <TabView tab={tabToRender} panes={panes} />
    </ResizablePanel>
    <ChatPanelResizable />
  </ResizablePanelGroup>
);
```
