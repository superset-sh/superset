---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
functional_group: RENDER
---

# Use Cases: Message Rendering (RENDER)

| ID | Title | Description |
|----|-------|-------------|
| UC-RENDER-01 | Render user and assistant messages | System displays user and assistant message bubbles with text content, role-styled alignment, and timestamps. |
| UC-RENDER-02 | Render streaming assistant text | System displays assistant text as it arrives, with atomic snapshot updates (no character-drip). |
| UC-RENDER-03 | Render markdown content | System renders markdown elements (code blocks, lists, links, tables, inline code) inside assistant messages. |
| UC-RENDER-04 | Render tool call blocks (collapsed) | System renders agent tool calls as collapsed cards showing tool name and status; expansion deferred to v1. |
| UC-RENDER-05 | Render plan blocks and reasoning blocks | System renders agent plan blocks (read-only) and reasoning blocks (collapsed extended-thinking) inside the message list. |
| UC-RENDER-06 | Render subagent execution as nested group | System displays subagent runs as a nested read-only message group within the parent turn. |
| UC-RENDER-07 | Auto-scroll and scroll-back affordance | System keeps the list anchored to the latest message and provides a scroll-back button when the user scrolls up. |

---

## UC-RENDER-01: Render user and assistant messages

User and assistant messages are rendered in a `@shopify/flash-list` (inverted) with role-styled bubbles. User messages are right-aligned with `bg-secondary`-style background and capped at `max-w-[85%]`. Assistant messages are left-aligned and full-width, no bubble background. Both render via component-named ports of desktop's `UserMessage` and `AssistantMessage` (`apps/mobile/components/chat/UserMessage/`, `AssistantMessage/`).

**Acceptance Criteria:**
- ☐ User can see their submitted messages rendered right-aligned with a styled bubble background on the chat view
- ☐ User can see assistant messages rendered left-aligned, full-width, with no bubble background
- ☐ System caps user message width at `max-w-[85%]` so a margin is visible on the trailing edge
- ☐ System renders each message via the mobile `UserMessage` or `AssistantMessage` component in `apps/mobile/components/chat/`
- ☐ User can long-press a message to copy its text content to the clipboard

---

## UC-RENDER-02: Render streaming assistant text

While a turn is streaming, the assistant message's text content updates as each new snapshot arrives. Mobile uses atomic per-snapshot text replacement (NOT desktop's character-drip via `setInterval`, which is incompatible with Hermes per the design audit). An optional Reanimated blinking-cursor effect indicates active streaming.

**Acceptance Criteria:**
- ☐ User can see assistant message text update as each new snapshot arrives during a streaming turn
- ☐ System updates the assistant message text atomically per snapshot without character-by-character animation
- ☐ User can see a blinking-cursor visual affordance at the end of the streaming text while the turn is active
- ☐ System removes the cursor affordance and finalizes the message text when the streaming turn completes
- ☐ User can see the streaming message remain in place (no layout jump) when the host emits a new snapshot

---

## UC-RENDER-03: Render markdown content

Assistant messages frequently contain markdown. Desktop uses `streamdown` (web-only); mobile uses an RN markdown renderer (`react-native-markdown-display` or equivalent native lib). Supported elements: paragraphs, headings, lists (ordered + unordered), code blocks with syntax highlighting (via `react-native-syntax-highlighter` or similar), inline code, links (open in OS browser on tap), tables (basic), blockquotes, horizontal rules.

**Acceptance Criteria:**
- ☐ User can see paragraphs, headings, ordered lists, unordered lists, blockquotes, and horizontal rules rendered in assistant messages
- ☐ User can see code blocks rendered with monospace font, dark background, and syntax-highlight coloring
- ☐ User can see inline code rendered with a contrasting background and monospace font
- ☐ User can tap a markdown link in an assistant message to open it in the OS browser
- ☐ System renders basic tables with column borders and aligned cells inside assistant messages
- ☐ User can long-press a code block to copy its full content to the clipboard

---

## UC-RENDER-04: Render tool call blocks (collapsed)

When the agent invokes a tool, it appears in the message stream as a collapsed `ToolCallBlock`-styled card showing the tool name, status indicator (running / completed / failed), and a chevron. v0 ships collapsed-only — expansion to view arguments/result is deferred. The component is named `ToolCallBlock` to match desktop's component tree.

**Acceptance Criteria:**
- ☐ User can see each tool call rendered as a collapsed card in the message list with tool name and status indicator
- ☐ User can see a status indicator showing running, completed, or failed state per the tool call lifecycle
- ☐ User can see the chevron pointing right (collapsed state) on tool call cards for v0
- ☐ System renders the tool call component at `apps/mobile/components/chat/ToolCallBlock/` with name parity to desktop
- ☐ System does NOT render an expansion UI for tool call arguments or result in v0 (deferred to a follow-up PRD)

---

## UC-RENDER-05: Render plan blocks and reasoning blocks

Plan blocks (`PlanBlock` per desktop naming) render the agent's proposed structured plan as a read-only card with the plan title and a collapsed steps list. Reasoning blocks (`ReasoningBlock` per desktop naming) render extended-thinking content in a collapsed-by-default container with a "Show reasoning" affordance. Neither is interactive in v0 beyond toggle expand/collapse.

**Acceptance Criteria:**
- ☐ User can see plan blocks rendered as cards with the plan title and a collapsed list of steps in the message stream
- ☐ User can tap a plan block to expand it and see the full steps list
- ☐ User can see reasoning blocks rendered collapsed with a "Show reasoning" affordance and an icon indicating extended thinking
- ☐ User can tap a reasoning block to expand its content and tap again to collapse
- ☐ System renders these components at `apps/mobile/components/chat/PlanBlock/` and `ReasoningBlock/` matching desktop names

---

## UC-RENDER-06: Render subagent execution as nested group

When a subagent runs inside the main turn, its events render as a nested group with visual indentation or a distinct container, matching desktop's `SubagentExecutionMessage` treatment. Mobile renders subagents read-only — users cannot interact with them directly (consistent with desktop).

**Acceptance Criteria:**
- ☐ User can see a subagent execution rendered as a visually nested group inside the parent assistant turn
- ☐ User can see the subagent's tool calls and text content rendered using the same `ToolCallBlock` and message components
- ☐ System indents or otherwise visually distinguishes the subagent group from the parent turn content
- ☐ System renders the component at `apps/mobile/components/chat/SubagentExecutionMessage/` with name parity to desktop

---

## UC-RENDER-07: Auto-scroll and scroll-back affordance

The message list (FlashList `inverted` or `maintainVisibleContentPosition`) keeps the view anchored to the most recent message. If the user scrolls up to read history, a floating "scroll to bottom" button appears with a Reanimated fade-in; tapping it returns the list to the latest message and the button fades out.

**Acceptance Criteria:**
- ☐ System keeps the message list scrolled to the most recent message when new messages arrive and the user is at the bottom
- ☐ System does NOT auto-scroll when the user has manually scrolled up to read older messages
- ☐ User can see a floating "scroll to bottom" button appear with fade animation when scrolled away from the bottom
- ☐ User can tap the scroll-back button to return the list to the latest message
- ☐ System uses Reanimated for the scroll-back button's appearance and disappearance animation
- ☐ System uses `@shopify/flash-list` for the message list to handle long histories without frame drops
