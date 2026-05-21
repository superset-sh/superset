---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
functional_group: COMP
---

# Use Cases: Composition + Send (COMP)

| ID | Title | Description |
|----|-------|-------------|
| UC-COMP-01 | Compose a message in Tiptap editor | User can type multiline text in the chat input with placeholder, autogrow, and slash/mention atomic tokens via `@10play/tentap-editor` for desktop parity. |
| UC-COMP-02 | Submit message with optimistic append | User can tap Send to submit a message and see it appear in the message list before the host acknowledges. |
| UC-COMP-03 | Stop a running turn | User can interrupt an in-progress assistant turn from the composer area. |
| UC-COMP-04 | Pick the model for a turn | User can choose between available models (Opus, Sonnet, Haiku, GPT variants) from a popover. |
| UC-COMP-05 | Set thinking level and permission mode | User can adjust thinking level (`off | low | medium | high | xhigh`) and permission mode from popovers in the composer. |

---

## UC-COMP-01: Compose a message in Tiptap editor

The chat input is a `@10play/tentap-editor` instance (WebView-hosted Tiptap) configured with the same minimal extension set desktop uses (Document, Paragraph, Text, HardBreak, History, Placeholder, Suggestion) plus the custom `SlashCommandNode` and `FileMentionNode`. The editor's serializer matches desktop's `serializeEditorToText.ts` wire format. User can type plain text, trigger `/` for slash commands (handled in UC-COMP-04 and PAUSE-adjacent flows), and (per scope deferral) `@` does not open file-mention autocomplete in v0 — Tiptap renders typed `@text` as a plain mention node placeholder, awaiting v1's host file search.

**Acceptance Criteria:**
- ☐ User can type multiline freeform text into the chat input on the chat view
- ☐ User can see a placeholder string when the input is empty and the placeholder disappears when typing starts
- ☐ System grows the input height to fit content up to a max height before introducing an internal scroll
- ☐ User can see the Tiptap editor render a styled slash-command pill atomically when the slash menu inserts a command
- ☐ System serializes the editor content to the same text wire format as desktop's `serializeEditorToText.ts` when the user submits a message
- ☐ User can position the cursor and delete content with standard mobile keyboard gestures including delete-as-unit for slash-command pills

---

## UC-COMP-02: Submit message with optimistic append

User taps Send (on-screen button) or uses the iOS/Android keyboard "send" action; the typed content is appended to the local message reducer as a `user` message before the host responds, then the actual `chat.sendMessage` mutation is awaited. The input clears immediately on submit.

**Acceptance Criteria:**
- ☐ User can tap an on-screen Send button to submit the composed message
- ☐ System appends the user message to the local message list immediately on submit (optimistic update)
- ☐ System clears the input field as soon as the user submits the message
- ☐ System calls `chat.sendMessage` over the relay with the serialized payload, sessionId, workspaceId, model, and thinking level
- ☐ User can see the optimistic message replaced by the canonical server message once the host acknowledges
- ☐ User can see an error toast and the input restored with the unsent text when `chat.sendMessage` fails

---

## UC-COMP-03: Stop a running turn

While an assistant turn is streaming, the Send button is replaced by a Stop button. Tapping Stop invokes `chat.stop` on the host, which cancels the in-progress harness call. The partial response remains in the message list (consistent with desktop behavior).

**Acceptance Criteria:**
- ☐ User can see the Send button replaced by a Stop button while a turn is streaming
- ☐ User can tap Stop during a streaming turn to interrupt the agent loop
- ☐ System calls `chat.stop` over the relay with the session and workspace ids when Stop is tapped
- ☐ User can see the partial assistant response remain in the message list after the turn stops
- ☐ System returns the composer to its idle (Send-button) state once the turn is confirmed stopped

---

## UC-COMP-04: Pick the model for a turn

A model picker affordance in the composer toolbar opens an `@rn-primitives/popover` listing models returned by cloud `chat.getModels` (Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5, GPT-5.5, GPT-5.4, GPT-5.3 Codex). The selected model is stored locally per session and passed as `metadata.model` on `chat.sendMessage`.

**Acceptance Criteria:**
- ☐ User can tap a model picker affordance in the composer toolbar to open a popover
- ☐ User can see the list of models in the popover loaded from cloud `chat.getModels`
- ☐ User can tap a model in the popover to select it for the current session
- ☐ System persists the selected model per session on the device and passes it as `metadata.model` to `chat.sendMessage`
- ☐ User can see the currently selected model shown as the affordance label or icon in the composer toolbar

---

## UC-COMP-05: Set thinking level and permission mode

The composer toolbar exposes a thinking-level affordance (`off | low | medium | high | xhigh`) and a permission-mode affordance (matching desktop's `PermissionModePicker`). Both open `@rn-primitives/popover` menus with the available values. Selections are passed on `chat.sendMessage` (`metadata.thinkingLevel`) and stored per session.

**Acceptance Criteria:**
- ☐ User can tap a thinking-level affordance in the composer to open a popover with the values `off`, `low`, `medium`, `high`, `xhigh`
- ☐ User can tap a permission-mode affordance in the composer to open a popover with the modes available on desktop's PermissionModePicker
- ☐ System passes the selected thinking level as `metadata.thinkingLevel` on every `chat.sendMessage` call
- ☐ System persists thinking level and permission mode per session locally and restores them when the user reopens the session
- ☐ User can see the currently selected thinking level and permission mode reflected as icon or label state on the composer affordances
