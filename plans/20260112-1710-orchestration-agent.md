# Orchestration Agent for Desktop App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

Build a top-level orchestration agent chat panel in the **desktop app** (`apps/desktop`) that enables users to manage complex multi-agent workflows. After this change, users can:

1. Open a chat panel on the right side of the workspace view
2. Describe complex tasks in natural language (e.g., "Pull my Linear tickets and create a plan for the sprint")
3. Watch the orchestrator spawn specialized sub-agents to accomplish the task
4. See real-time progress as agents work in parallel
5. Review and approve actions before agents execute them

The orchestrator acts as a "manager" agent that coordinates specialized "worker" agents, pulling context from Linear, codebase knowledge, and other integrations.

## Assumptions

1. **Chat panel store exists**: `apps/desktop/src/renderer/stores/chat-panel-state.ts` has panel open/size state (currently not exported)
2. **Linear integration is production-ready**: Existing OAuth + `getLinearClient()` utility in `packages/trpc`
3. **tRPC for IPC**: All main-renderer communication uses tRPC (see `apps/desktop/src/lib/trpc`)
4. **Subscriptions use observables**: Not async generators (required by trpc-electron)
5. **AI SDK not yet installed**: Need to add `ai`, `@ai-sdk/anthropic` to apps/desktop

## Open Questions

1. **API Key Management**: Where should the Anthropic API key be stored? (Electron main process env? User settings?)
2. **Context Passing**: How to pass workspace context (current files, terminal output) to the agent?
3. **Approval Workflow**: Which actions require approval before execution?

## Progress

- [x] Milestone 1: Re-enable Chat Panel UI Foundation
- [ ] Milestone 2: tRPC Router for Chat with Claude Opus 4.5
- [ ] Milestone 3: Linear Integration Tools
- [ ] Milestone 4: Sub-agent Spawning and Coordination
- [ ] Milestone 5: Task Progress and Streaming UI
- [ ] Milestone 6: Approval Workflows

## Surprises & Discoveries

(To be updated during implementation)

## Decision Log

(To be updated during implementation)

## Outcomes & Retrospective

(To be updated at completion)

---

## Context and Orientation

### Affected Apps and Packages

- **apps/desktop**: Primary location for chat panel UI and tRPC integration
- **packages/trpc**: Existing Linear utilities, will add chat router
- **packages/ui**: Shared UI components (ai-elements components available)
- **packages/db**: Stores integration connections with Linear tokens

### Key Existing Files

**Desktop App Structure:**
```
apps/desktop/src/
├── main/                    # Electron main process (Node.js)
│   ├── lib/                # Business logic, tRPC context
│   └── index.ts            # App initialization
├── renderer/               # React UI (browser environment)
│   ├── screens/main/       # Primary UI structure
│   │   ├── components/
│   │   │   ├── TopBar/           # Window controls, will add ChatPanelControl
│   │   │   └── WorkspaceView/
│   │   │       └── ContentView/
│   │   │           └── TabsContent/  # Where ChatPanel goes
│   │   └── index.tsx       # MainScreen with hotkey handlers
│   ├── stores/             # Zustand state stores
│   │   ├── chat-panel-state.ts  # EXISTS - panel open/size state
│   │   └── index.ts        # Exports (chat store commented out)
│   └── contexts/           # React context providers
├── preload/                # Electron preload scripts
├── shared/                 # Shared types, hotkeys
│   └── hotkeys.ts          # Hotkey definitions
└── lib/
    └── trpc/               # tRPC setup for IPC
        └── routers/        # tRPC routers
```

**Existing Chat Infrastructure (disabled but ready):**
- `apps/desktop/src/renderer/stores/chat-panel-state.ts` - Zustand store with `isOpen`, `size`, `togglePanel()`
- `apps/desktop/docs/CHAT_PANEL_FEATURE.md` - Integration guide

**Linear Integration (in packages/trpc):**
- `packages/trpc/src/router/integration/linear/utils.ts` - `getLinearClient(organizationId)`
- `packages/trpc/src/lib/integrations/linear/` - Priority mapping utilities

**AI UI Components (packages/ui):**
- `packages/ui/src/components/ai-elements/message.tsx` - Chat messages
- `packages/ui/src/components/ai-elements/prompt-input.tsx` - Input with attachments
- `packages/ui/src/components/ai-elements/tool.tsx` - Tool call display
- `packages/ui/src/components/ai-elements/loader.tsx` - Activity spinner

---

## UI/UX Design Specification

### Design Language

The chat panel follows the desktop app's existing design patterns observed in ChangesView, CommitInput, and sidebar components:

- **Compact sizing**: `text-[10px]` for labels, `text-xs` for content, `h-6`/`h-7` buttons
- **Subtle backgrounds**: `bg-muted/50` for interactive elements, no harsh borders
- **Minimal chrome**: Ghost buttons, borderless inputs until focus
- **Consistent spacing**: `px-2 py-1.5` for headers, `gap-1.5` between elements

### Layout Integration

The chat panel sits **alongside** the existing Changes sidebar, not replacing it. Users can have both open:

```
TabsContent (flex-1 min-h-0 flex overflow-hidden)
├── Main Content (flex-1 min-w-0)
│   └── TabView (terminals, editors)
├── ChatPanel (resizable, optional)
│   └── width: 320px default, 240-480px range
└── Sidebar (resizable, optional)
    └── ChangesView (existing)
```

This allows developers to:
- Chat while viewing diffs
- Reference code changes while asking questions
- Keep context visible during conversations

### Component Architecture

```
ChatPanel/
├── ChatPanel.tsx                 # Main container, flex column
├── ChatPanelHeader/
│   ├── ChatPanelHeader.tsx       # Compact header with controls
│   └── ModelSelector.tsx         # Optional model dropdown
├── ChatMessageList/
│   ├── ChatMessageList.tsx       # Virtualized scroll container
│   ├── ChatMessage.tsx           # Message bubble + metadata
│   ├── UserMessage.tsx           # Right-aligned user bubble
│   ├── AssistantMessage.tsx      # Left-aligned with avatar
│   └── ToolInvocation.tsx        # Collapsible tool card
├── ChatInputArea/
│   ├── ChatInputArea.tsx         # Input container with actions
│   ├── ChatTextarea.tsx          # Auto-growing textarea
│   └── QuickActions.tsx          # Attachment, clear buttons
├── ChatEmptyState/
│   ├── ChatEmptyState.tsx        # Welcome screen
│   └── SuggestionChip.tsx        # Quick action chips
└── index.ts
```

### Visual Specifications

#### Panel Container
```tsx
<aside className="flex flex-col h-full border-l border-border bg-background">
  {/* No extra padding - children handle their own */}
</aside>
```

#### Header (matches ChangesHeader pattern)
```tsx
<div className="flex items-center justify-between gap-1.5 px-2 py-1.5 border-b border-border">
  {/* Left: Title + Status */}
  <div className="flex items-center gap-1.5 min-w-0">
    <div className="size-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
      <SparklesIcon className="size-3 text-white" />
    </div>
    <span className="text-xs font-medium truncate">Orchestrator</span>
    {isStreaming && (
      <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
    )}
  </div>

  {/* Right: Actions */}
  <div className="flex items-center gap-0.5 shrink-0">
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6">
          <TrashIcon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Clear conversation</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <XIcon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <HotkeyTooltipContent label="Close" hotkeyId="TOGGLE_CHAT_PANEL" />
      </TooltipContent>
    </Tooltip>
  </div>
</div>
```

#### Message List
```tsx
<div className="flex-1 overflow-y-auto" ref={scrollRef}>
  <div className="flex flex-col gap-3 p-2">
    {messages.map((msg) => (
      <ChatMessage key={msg.id} message={msg} />
    ))}
    {isStreaming && <StreamingIndicator />}
  </div>
</div>

{/* Scroll to bottom button - appears when scrolled up */}
{!isAtBottom && (
  <Button
    variant="secondary"
    size="sm"
    className="absolute bottom-20 right-4 h-7 gap-1 shadow-md"
    onClick={scrollToBottom}
  >
    <ArrowDownIcon className="size-3" />
    <span className="text-[10px]">New messages</span>
  </Button>
)}
```

#### User Message
```tsx
<div className="flex justify-end">
  <div className="max-w-[85%] rounded-lg bg-primary/10 px-2.5 py-1.5">
    <p className="text-xs text-foreground whitespace-pre-wrap break-words">
      {message.content}
    </p>
    <span className="text-[10px] text-muted-foreground mt-1 block text-right">
      {formatTime(message.timestamp)}
    </span>
  </div>
</div>
```

#### Assistant Message
```tsx
<div className="flex gap-2">
  {/* Avatar */}
  <div className="size-5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 mt-0.5">
    <SparklesIcon className="size-3 text-white" />
  </div>

  {/* Content */}
  <div className="flex-1 min-w-0 space-y-2">
    {/* Rendered markdown */}
    <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none">
      <MarkdownRenderer content={message.content} />
    </div>

    {/* Tool invocations */}
    {message.toolCalls?.map((tool) => (
      <ToolInvocation key={tool.id} tool={tool} />
    ))}

    {/* Streaming cursor */}
    {message.isStreaming && (
      <span className="inline-block w-1.5 h-3.5 bg-foreground/70 animate-pulse" />
    )}
  </div>
</div>
```

#### Tool Invocation Card
```tsx
<div className="rounded-md border border-border overflow-hidden">
  {/* Header - always visible */}
  <button
    onClick={toggleExpand}
    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 transition-colors"
  >
    <ToolStatusIcon status={tool.status} className="size-3.5" />
    <span className="text-[10px] font-medium flex-1 text-left truncate">
      {getToolDisplayName(tool.name)}
    </span>
    <ToolStatusBadge status={tool.status} />
    <ChevronDownIcon className={cn(
      "size-3 text-muted-foreground transition-transform",
      isExpanded && "rotate-180"
    )} />
  </button>

  {/* Expandable content */}
  {isExpanded && (
    <div className="border-t border-border bg-muted/30 px-2 py-1.5 space-y-1.5">
      {tool.args && (
        <div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Input</span>
          <pre className="text-[10px] mt-0.5 p-1.5 rounded bg-background overflow-x-auto">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>
      )}
      {tool.result && (
        <div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Output</span>
          <pre className="text-[10px] mt-0.5 p-1.5 rounded bg-background overflow-x-auto">
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )}
</div>
```

**Tool Status Badges:**
```tsx
const statusConfig = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  running: { label: "Running", className: "bg-blue-500/10 text-blue-500", animate: true },
  success: { label: "Done", className: "bg-green-500/10 text-green-500" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
};

<span className={cn(
  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
  statusConfig[status].className,
  statusConfig[status].animate && "animate-pulse"
)}>
  {statusConfig[status].label}
</span>
```

#### Input Area (matches CommitInput pattern)
```tsx
<div className="border-t border-border p-2 space-y-1.5">
  {/* Textarea with auto-grow */}
  <Textarea
    ref={inputRef}
    value={input}
    onChange={(e) => setInput(e.target.value)}
    placeholder="Ask anything... (⌘↵ to send)"
    className="min-h-[52px] max-h-[120px] resize-none text-xs bg-background field-sizing-content"
    onKeyDown={(e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && input.trim()) {
        e.preventDefault();
        handleSend();
      }
    }}
  />

  {/* Actions row */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6">
            <PaperclipIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Attach file</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6">
            <AtSignIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mention context</TooltipContent>
      </Tooltip>
    </div>

    <Button
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={handleSend}
      disabled={!input.trim() || isLoading}
    >
      {isLoading ? (
        <>
          <StopCircleIcon className="size-3.5" />
          <span>Stop</span>
        </>
      ) : (
        <>
          <SendIcon className="size-3.5" />
          <span>Send</span>
        </>
      )}
    </Button>
  </div>
</div>
```

#### Empty State
```tsx
<div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
  <div className="size-12 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center mb-3">
    <SparklesIcon className="size-6 text-violet-500" />
  </div>
  <h3 className="text-sm font-medium mb-1">Orchestration Agent</h3>
  <p className="text-[10px] text-muted-foreground mb-4 max-w-[200px]">
    Ask me to help with tasks, analyze code, or manage your workflow.
  </p>

  {/* Suggestion chips */}
  <div className="flex flex-wrap gap-1.5 justify-center">
    {suggestions.map((suggestion) => (
      <button
        key={suggestion.id}
        onClick={() => handleSuggestion(suggestion.prompt)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-background text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
      >
        <suggestion.icon className="size-3" />
        <span>{suggestion.label}</span>
      </button>
    ))}
  </div>
</div>
```

**Suggestion data:**
```tsx
const suggestions = [
  { id: 1, icon: ListTodoIcon, label: "My Linear tickets", prompt: "What Linear tickets are assigned to me?" },
  { id: 2, icon: GitBranchIcon, label: "Summarize changes", prompt: "Summarize the changes in this branch" },
  { id: 3, icon: HelpCircleIcon, label: "Help me with...", prompt: "Help me " },
];
```

#### TopBar Control Button
```tsx
// Matches SidebarControl pattern
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className={cn(
        "no-drag gap-1.5",
        isOpen
          ? "font-semibold text-foreground bg-accent"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <MessageSquareIcon className="size-4" />
      <span className="text-xs">Chat</span>
      {hasUnread && (
        <span className="size-1.5 rounded-full bg-primary" />
      )}
    </Button>
  </TooltipTrigger>
  <TooltipContent side="bottom" showArrow={false}>
    <HotkeyTooltipContent label="Toggle Chat Panel" hotkeyId="TOGGLE_CHAT_PANEL" />
  </TooltipContent>
</Tooltip>
```

### Animations & Micro-interactions

1. **Panel slide-in**: Use ResizablePanel's existing pattern (instant, no animation)
2. **Message appear**: Fade in + slight slide up (`animate-in fade-in-0 slide-in-from-bottom-2 duration-200`)
3. **Streaming cursor**: Pulse animation on typing indicator
4. **Tool status**: Pulse on "running" state
5. **Scroll button**: Fade in when scrolled up
6. **Button hovers**: `transition-colors` on all interactive elements

### Accessibility

- Full keyboard navigation (Tab through messages, Enter to expand tools)
- `aria-live="polite"` on message list for screen reader announcements
- Focus trap when input is focused
- Escape closes panel (when not typing)
- High contrast mode via CSS variables

### Responsive Behavior

- **Min width 240px**: Input stacks vertically, suggestions hidden
- **Default 320px**: Full layout as designed
- **Max width 480px**: Message bubbles can be wider

### Dark Mode

All colors use semantic tokens that auto-adapt:
- `bg-background`, `bg-muted`, `bg-muted/50`
- `text-foreground`, `text-muted-foreground`
- `border-border`
- Status colors use alpha variants (`bg-green-500/10`)

### Hotkey

- **Toggle Chat Panel**: `meta+l` (matches existing sidebar pattern)
  - Note: Conflicts with TOGGLE_SIDEBAR - need to decide:
    - Option A: Use `meta+shift+l` for chat
    - Option B: Use `meta+j` for chat
    - Option C: Rename TOGGLE_SIDEBAR to `meta+shift+l`, use `meta+l` for chat

---

## Plan of Work

### Milestone 1: Re-enable Chat Panel UI Foundation

This milestone enables the existing chat panel infrastructure and creates the basic UI shell. At completion, users can toggle an empty chat panel in the workspace view.

**Scope:**
1. Export chat panel store from `stores/index.ts`
2. Add `TOGGLE_CHAT_PANEL` hotkey
3. Create `ChatPanelControl` toggle button for TopBar
4. Create `ChatPanel` component shell
5. Integrate into `TabsContent` with ResizablePanelGroup
6. Wire up hotkey handler in MainScreen

**Step 1: Export the store**

Edit `apps/desktop/src/renderer/stores/index.ts`:
```typescript
// Uncomment this line:
export * from "./chat-panel-state";
```

**Step 2: Add hotkey definition**

Edit `apps/desktop/src/shared/hotkeys.ts`:
```typescript
// Add after TOGGLE_SIDEBAR:
TOGGLE_CHAT_PANEL: defineHotkey({
  keys: "meta+shift+l",
  label: "Toggle Chat Panel",
  category: "Layout",
}),
```

**Step 3: Create ChatPanelControl**

Create `apps/desktop/src/renderer/screens/main/components/TopBar/ChatPanelControl/ChatPanelControl.tsx`:
```tsx
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { MessageSquareIcon } from "lucide-react";
import { useChatPanelStore } from "renderer/stores";
import { useHotkeyLabel } from "renderer/hooks/useHotkeyLabel";

export function ChatPanelControl() {
  const { isOpen, togglePanel } = useChatPanelStore();
  const hotkeyLabel = useHotkeyLabel("TOGGLE_CHAT_PANEL");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={togglePanel}
          data-active={isOpen}
          className="data-[active=true]:bg-accent"
        >
          <MessageSquareIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Toggle Chat Panel ({hotkeyLabel})</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

Create `apps/desktop/src/renderer/screens/main/components/TopBar/ChatPanelControl/index.ts`:
```typescript
export { ChatPanelControl } from "./ChatPanelControl";
```

**Step 4: Create ChatPanel shell**

Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/ChatPanel/ChatPanel.tsx`:
```tsx
import { ScrollArea } from "@superset/ui/scroll-area";
import { Button } from "@superset/ui/button";
import { SparklesIcon, XIcon } from "lucide-react";
import { useChatPanelStore } from "renderer/stores";

export function ChatPanel() {
  const { togglePanel } = useChatPanelStore();

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">Orchestrator</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={togglePanel}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-3">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <SparklesIcon className="size-8 mb-2" />
          <p className="text-sm">Chat coming soon...</p>
        </div>
      </ScrollArea>

      {/* Input area - placeholder */}
      <div className="border-t border-border p-2">
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Ask anything...
        </div>
      </div>
    </div>
  );
}
```

Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/ChatPanel/index.ts`:
```typescript
export { ChatPanel } from "./ChatPanel";
```

**Step 5: Integrate into TabsContent**

Edit `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/index.tsx`:
```tsx
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@superset/ui/resizable";
import { useChatPanelStore } from "renderer/stores";
import { ChatPanel } from "./ChatPanel";

// Inside the component:
const { isOpen: isChatOpen, size: chatSize, setSize: setChatSize } = useChatPanelStore();

// Update the return JSX:
return (
  <ResizablePanelGroup direction="horizontal" className="flex-1 h-full">
    <ResizablePanel defaultSize={isChatOpen ? 100 - chatSize : 100} minSize={30}>
      {/* Existing TabView content */}
      <TabView tab={tabToRender} panes={panes} />
    </ResizablePanel>

    {isChatOpen && (
      <>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={chatSize}
          minSize={15}
          maxSize={50}
          onResize={setChatSize}
        >
          <ChatPanel />
        </ResizablePanel>
      </>
    )}
  </ResizablePanelGroup>
);
```

**Step 6: Add hotkey handler**

Edit `apps/desktop/src/renderer/screens/main/index.tsx`:
```tsx
import { useChatPanelStore } from "renderer/stores";

// Inside MainScreen:
const { togglePanel: toggleChatPanel } = useChatPanelStore();

// Add after TOGGLE_SIDEBAR hotkey handler:
useAppHotkey(
  "TOGGLE_CHAT_PANEL",
  () => {
    if (isWorkspaceView) toggleChatPanel();
  },
  undefined,
  [toggleChatPanel, isWorkspaceView],
);
```

**Step 7: Add TopBar button**

Edit `apps/desktop/src/renderer/screens/main/components/TopBar/index.tsx`:
```tsx
import { ChatPanelControl } from "./ChatPanelControl";

// In the JSX, add after existing controls:
<ChatPanelControl />
```

**Acceptance:**
```bash
cd apps/desktop && bun run dev

# Test 1: Toggle via TopBar
# Click chat icon in TopBar - panel slides in from right
# Click X or chat icon - panel closes

# Test 2: Toggle via hotkey
# Press Cmd+Shift+L - panel toggles
# Only works in workspace view (not settings)

# Test 3: Resize
# Drag the resize handle - panel resizes
# Size persists across toggle

# Test 4: State persistence
# Open panel, close app, reopen - panel state preserved
```

---

### Milestone 2: tRPC Router for Chat with Claude Opus 4.5

This milestone creates the backend infrastructure for chat. At completion, users can send messages and receive streaming responses from Claude Opus 4.5.

**Scope:**
1. Install AI SDK dependencies in desktop app
2. Create chat tRPC router in main process
3. Implement streaming via observable subscription
4. Connect ChatPanel UI to tRPC

**Step 1: Install dependencies**

```bash
cd apps/desktop
bun add ai @ai-sdk/anthropic zod
```

**Step 2: Create chat router**

Create `apps/desktop/src/lib/trpc/routers/chat.ts`:
```typescript
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { streamText, type TextStreamPart } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { router, publicProcedure } from "../trpc";

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const SYSTEM_PROMPT = `You are the Superset Orchestration Agent, an AI assistant for a developer productivity platform.

Your capabilities include:
- Helping users understand and manage their tasks
- Answering questions about their workflow
- Providing guidance on development tasks

Be concise, helpful, and use markdown formatting for clarity.`;

export const chatRouter = router({
  // Send a message and stream the response
  sendMessage: publicProcedure
    .input(z.object({
      messages: z.array(MessageSchema),
    }))
    .subscription(({ input }) => {
      return observable<{ type: string; content?: string; error?: string }>((emit) => {
        const abortController = new AbortController();

        (async () => {
          try {
            const result = streamText({
              model: anthropic("claude-opus-4-5-20250514"),
              system: SYSTEM_PROMPT,
              messages: input.messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              abortSignal: abortController.signal,
            });

            for await (const part of result.textStream) {
              emit.next({ type: "text-delta", content: part });
            }

            emit.next({ type: "finish" });
          } catch (error) {
            if (error instanceof Error && error.name !== "AbortError") {
              emit.next({ type: "error", error: error.message });
            }
          } finally {
            emit.complete();
          }
        })();

        return () => {
          abortController.abort();
        };
      });
    }),
});

export type ChatRouter = typeof chatRouter;
```

**Step 3: Add router to main tRPC**

Edit `apps/desktop/src/lib/trpc/routers/index.ts`:
```typescript
import { chatRouter } from "./chat";

export const appRouter = router({
  // ... existing routers
  chat: chatRouter,
});
```

**Step 4: Create chat store for messages**

Create `apps/desktop/src/renderer/stores/chat-messages-state.ts`:
```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { nanoid } from "nanoid";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

interface ChatMessagesState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  addUserMessage: (content: string) => string;
  startAssistantMessage: () => string;
  appendToAssistantMessage: (id: string, content: string) => void;
  finishAssistantMessage: (id: string) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const useChatMessagesStore = create<ChatMessagesState>()(
  devtools(
    (set, get) => ({
      messages: [],
      isLoading: false,
      error: null,

      addUserMessage: (content) => {
        const id = nanoid();
        set((state) => ({
          messages: [...state.messages, { id, role: "user", content }],
          isLoading: true,
          error: null,
        }));
        return id;
      },

      startAssistantMessage: () => {
        const id = nanoid();
        set((state) => ({
          messages: [...state.messages, { id, role: "assistant", content: "", isStreaming: true }],
        }));
        return id;
      },

      appendToAssistantMessage: (id, content) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + content } : m
          ),
        }));
      },

      finishAssistantMessage: (id) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, isStreaming: false } : m
          ),
          isLoading: false,
        }));
      },

      setError: (error) => set({ error, isLoading: false }),
      clearMessages: () => set({ messages: [], error: null }),
    }),
    { name: "ChatMessagesStore" }
  )
);
```

Export from `stores/index.ts`:
```typescript
export * from "./chat-messages-state";
```

**Step 5: Update ChatPanel with real UI**

Update `ChatPanel.tsx` to use tRPC and render messages:
```tsx
import { ScrollArea } from "@superset/ui/scroll-area";
import { Button } from "@superset/ui/button";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@superset/ui/prompt-input";
import { Message, MessageContent, MessageResponse } from "@superset/ui/message";
import { Loader } from "@superset/ui/loader";
import { SparklesIcon, XIcon } from "lucide-react";
import { useChatPanelStore, useChatMessagesStore } from "renderer/stores";
import { trpc } from "renderer/lib/trpc";
import { useRef, useEffect } from "react";

export function ChatPanel() {
  const { togglePanel } = useChatPanelStore();
  const {
    messages,
    isLoading,
    addUserMessage,
    startAssistantMessage,
    appendToAssistantMessage,
    finishAssistantMessage,
    setError,
  } = useChatMessagesStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    addUserMessage(text);
    const assistantId = startAssistantMessage();

    // Subscribe to streaming response
    const allMessages = [...messages, { id: "temp", role: "user" as const, content: text }];

    trpc.chat.sendMessage.subscribe(
      { messages: allMessages.map((m) => ({ id: m.id, role: m.role, content: m.content })) },
      {
        onData: (data) => {
          if (data.type === "text-delta" && data.content) {
            appendToAssistantMessage(assistantId, data.content);
          } else if (data.type === "finish") {
            finishAssistantMessage(assistantId);
          } else if (data.type === "error") {
            setError(data.error || "Unknown error");
          }
        },
        onError: (err) => {
          setError(err.message);
        },
      }
    );
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">Orchestrator</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={togglePanel}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-4 p-3">
          {messages.length === 0 ? (
            <ChatEmptyState />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  <MessageResponse>{message.content}</MessageResponse>
                  {message.isStreaming && <Loader size={14} className="mt-1" />}
                </MessageContent>
              </Message>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-2">
        <PromptInput onSubmit={({ text }) => handleSend(text)}>
          <PromptInputTextarea placeholder="Ask anything..." disabled={isLoading} />
          <PromptInputFooter>
            <PromptInputSubmit disabled={isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-8 text-center">
      <SparklesIcon className="size-8 text-muted-foreground mb-2" />
      <p className="text-sm font-medium">Orchestration Agent</p>
      <p className="text-xs text-muted-foreground mt-1">
        Ask me to help with tasks, analyze code, or manage your workflow.
      </p>
    </div>
  );
}
```

**Environment Variables:**
Add to `.env` at monorepo root:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Acceptance:**
```bash
cd apps/desktop && bun run dev

# Test 1: Send message
# Type "Hello, what can you help me with?"
# See streaming response from Claude Opus 4.5

# Test 2: Markdown rendering
# Ask "Show me a code example"
# See syntax-highlighted code in response

# Test 3: Loading state
# Send message, see loading indicator while streaming
# Submit button disabled during streaming
```

---

### Milestone 3: Linear Integration Tools

This milestone adds Linear tools using the existing `getLinearClient()` infrastructure. At completion, the agent can list and search Linear issues.

**Scope:**
1. Create Linear tools using existing `packages/trpc` utilities
2. Add tool execution to chat router
3. Update ChatPanel to display tool calls

**Files to create:**

`apps/desktop/src/lib/trpc/routers/chat/tools/linear.ts`:
```typescript
import { tool } from "ai";
import { z } from "zod";
import { getLinearClient } from "@superset/trpc/lib/integrations/linear";

export function createLinearTools(organizationId: string) {
  return {
    listMyIssues: tool({
      description: "List Linear issues assigned to the current user",
      parameters: z.object({
        limit: z.number().min(1).max(50).default(10),
      }),
      execute: async ({ limit }) => {
        const client = await getLinearClient(organizationId);
        if (!client) {
          return { error: "Linear not connected" };
        }

        const issues = await client.issues({
          first: limit,
          filter: { assignee: { isMe: { eq: true } } },
        });

        return {
          issues: issues.nodes.map((issue) => ({
            identifier: issue.identifier,
            title: issue.title,
            state: issue.state?.name,
            priority: issue.priority,
            url: issue.url,
          })),
        };
      },
    }),

    searchIssues: tool({
      description: "Search Linear issues by text",
      parameters: z.object({
        query: z.string(),
        limit: z.number().default(10),
      }),
      execute: async ({ query, limit }) => {
        const client = await getLinearClient(organizationId);
        if (!client) {
          return { error: "Linear not connected" };
        }

        const results = await client.searchIssues(query, { first: limit });
        return {
          issues: results.nodes.map((issue) => ({
            identifier: issue.identifier,
            title: issue.title,
            state: issue.state?.name,
            url: issue.url,
          })),
        };
      },
    }),
  };
}
```

Update chat router to use tools with `streamText`:
```typescript
const result = streamText({
  model: anthropic("claude-opus-4-5-20250514"),
  system: SYSTEM_PROMPT,
  messages: input.messages,
  tools: createLinearTools(organizationId),
  maxSteps: 10,
});
```

**Acceptance:**
```bash
# Ensure Linear is connected
# Ask "What Linear tickets are assigned to me?"
# Agent calls listMyIssues tool
# Results displayed with issue cards
```

---

### Milestone 4-6: Sub-agents, Progress, Approvals

(Details similar to original plan but adapted for desktop/tRPC architecture)

---

## Validation and Acceptance

### Final Acceptance Criteria

1. **Chat Panel**: Opens/closes via TopBar button and `Cmd+Shift+L` hotkey
2. **Basic Chat**: Streaming conversation with Claude Opus 4.5
3. **Linear Tools**: Can list and search Linear issues
4. **State Persistence**: Panel state and messages survive app restart

### Validation Commands

```bash
cd apps/desktop

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build

# Dev mode testing
bun run dev
```

## Key Technical Notes

### tRPC Subscriptions (Critical)

Use **observables**, not async generators:
```typescript
// CORRECT
import { observable } from "@trpc/server/observable";

subscription: publicProcedure.subscription(() => {
  return observable((emit) => {
    // ...
    return () => { /* cleanup */ };
  });
});

// WRONG - will not work with trpc-electron
subscription: publicProcedure.subscription(async function* () {
  // ...
});
```

### No Node.js in Renderer

- Chat UI lives in renderer (React)
- AI SDK calls happen in main process via tRPC
- Never import Node.js modules in renderer code

### Environment Variables

Loaded in main process from `.env`:
```typescript
// In apps/desktop/src/main/index.ts
import { config } from "dotenv";
config({ path: "../../.env", override: true });
```

---

## Revision History

- **2026-01-12**: Rewrote plan for desktop app (was incorrectly targeting web app)
