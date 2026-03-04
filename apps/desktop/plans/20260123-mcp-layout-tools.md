# MCP Layout Tools for Agent Screen Organization

**Status:** Planned
**Date:** 2026-01-23

## Overview

Enable AI agents to fully organize the desktop app's screen layout for users. The agent should be able to understand current state, create/arrange panes, and declaratively set layouts.

## Layout Node Schema

```typescript
type LayoutNode =
  | { paneId: string }  // Reference existing pane (preserves state)
  | { newTerminal: true }
  | { newFile: { path: string, line?: number } }
  | {
      split: "horizontal" | "vertical",
      ratio?: number,  // Default 50
      first: LayoutNode,
      second: LayoutNode
    }
```

## Tool Set

| Tool | Purpose |
|------|---------|
| `get_layout_state` | Full state: tabs, panes, layout tree, focus |
| `set_tab_layout` | Declaratively set/modify a tab's layout |
| `create_tab` | New tab with optional initial layout |
| `close_tab` | Close tab |
| `set_active_tab` | Switch tabs |
| `focus_pane` | Set focused pane |

## Example: Incremental Layout Changes

```javascript
// Current state: single terminal "pane-abc"
// User: "I want to see the test file next to my terminal"

set_tab_layout(tabId, {
  split: "horizontal",
  ratio: 60,
  first: { paneId: "pane-abc" },  // Preserves existing terminal + its state
  second: { newFile: { path: "src/Button.test.ts" } }
})

// Later: "Actually, add another terminal below the file"

set_tab_layout(tabId, {
  split: "horizontal",
  ratio: 60,
  first: { paneId: "pane-abc" },
  second: {
    split: "vertical",
    first: { paneId: "pane-xyz" },  // The file pane we just created
    second: { newTerminal: true }
  }
})
```

## Example: Agent Sets Up PR Review Layout

```javascript
// Agent thinks: "User wants to review a PR. I'll set up file viewer + terminal"

set_tab_layout(activeTabId, {
  split: "horizontal",
  ratio: 60,
  first: { newFile: { path: "src/components/Button.tsx" } },
  second: { newTerminal: true }
})
```

## get_layout_state Response Shape

```typescript
{
  workspaceId: string,
  workspaceName: string,
  tabs: [
    {
      id: string,
      name: string,
      isActive: boolean,
      layout: LayoutNode,  // With paneId references resolved to include type/status
      panes: [
        {
          id: string,
          type: "terminal" | "file-viewer",
          status: "idle" | "working" | "review" | "permission",
          // Terminal-specific
          cwd?: string,
          // File-viewer specific
          filePath?: string,
        }
      ]
    }
  ],
  focusedPaneId: string | null
}
```

## Implementation Plan

### 1. Desktop: `tools/types.ts` - Extend ToolContext

```typescript
interface ToolContext {
  // ... existing

  // Tab operations
  getLayoutState: () => LayoutState
  setTabLayout: (tabId: string, layout: LayoutNode) => { createdPanes: string[] }
  createTab: (workspaceId: string, layout?: LayoutNode) => { tabId: string }
  closeTab: (tabId: string) => void
  setActiveTab: (workspaceId: string, tabId: string) => void
  focusPaneById: (paneId: string) => void
}
```

### 2. Desktop: `tools/layout-utils.ts` - Layout tree logic

- `buildLayoutState()` - Serialize current state for agent
- `applyLayoutNode()` - Convert LayoutNode → MosaicNode, creating panes as needed
- `diffLayout()` - Find panes to remove (not referenced in new layout)

### 3. Desktop: Tool files

- `get-layout-state.ts`
- `set-tab-layout.ts`
- `create-tab.ts`
- `close-tab.ts`
- `set-active-tab.ts`
- `focus-pane.ts`

### 4. Desktop: `useCommandWatcher.ts` - Wire up context

- Import `useTabsStore`
- Provide the new methods to ToolContext

### 5. API: `apps/api/src/lib/mcp/tools.ts` - MCP tool definitions

Add 6 new `server.tool()` calls that route to desktop via `executeOnDevice()`:

```typescript
server.tool(
  "get_layout_state",
  "Get the current layout state including tabs, panes, and focus",
  { deviceId: z.string().optional() },
  async (params) => executeOnDevice({ ctx, deviceId, tool: "get_layout_state", params: {} })
);

server.tool(
  "set_tab_layout",
  "Declaratively set or modify a tab's pane layout",
  {
    deviceId: z.string().optional(),
    tabId: z.string(),
    layout: LayoutNodeSchema,  // Zod schema matching LayoutNode type
  },
  async (params) => executeOnDevice({ ctx, deviceId, tool: "set_tab_layout", params })
);

// ... etc for create_tab, close_tab, set_active_tab, focus_pane
```

## Key Design Decisions

1. **Incremental by default** - Referencing `{ paneId: "..." }` preserves existing pane state (terminal history, file scroll position)

2. **Panes not referenced get cleaned up** - When `set_tab_layout` is called, any panes in the old layout but not in the new layout are closed

3. **Auto-focus on creation** - New panes should auto-focus unless specified otherwise

4. **Ratio defaults to 50** - Splits are even by default

## Files to Clean Up

The following partial implementation files were created but should be deleted:

- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/add-tab.ts`
- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/add-pane.ts`
- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/list-tabs.ts`
- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/set-active-tab.ts`
- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/remove-tab.ts`
- `apps/desktop/src/renderer/hooks/useCommandWatcher/tools/remove-pane.ts`
