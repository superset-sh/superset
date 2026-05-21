---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
---

# Mobile Chat (v0) — Functional Groups

## Functional Groups

| Group | Prefix | Description |
|-------|--------|-------------|
| Session Lifecycle | **SESS** | List, resume, start, end, delete, and rename chat sessions in a workspace. Backed by the cloud chat router (`chat.createSession`, `chat.updateSession`, `chat.deleteSession`, `chat.updateTitle`) and the ElectricSQL `chat_sessions` shape for realtime listing. |
| Composition + Send | **COMP** | Compose a message in Tiptap (`@10play/tentap-editor` for parity), invoke slash commands from a popover, choose model / thinking-level / permission-mode, submit a message, stop a running turn. Backed by the host-service tRPC chat router via relay. |
| Message Rendering | **RENDER** | Render user/assistant messages, streaming text, markdown, tool call blocks (collapsed), plan blocks, reasoning blocks, subagent execution, auto-scroll, and scroll-back affordance. Built on `@shopify/flash-list` for virtualization. |
| Mid-Turn Interactive Prompts | **PAUSE** | Handle the three session-pausing states — tool approval, `ask_user` question, plan approval — as `@gorhom/bottom-sheet` modals with thumb-reachable buttons. Backed by `chat.respondToApproval`, `chat.respondToQuestion`, `chat.respondToPlan`. |
| Platform Integration | **PLATF** | Mobile-specific platform concerns: OS push notifications via Expo push wired to host lifecycle events, session resume after background/foreground using cursor protocol, host-offline UX with automatic reconnect, multi-device session sync via Electric shape. |

## Use Case Summary

| Group | Prefix | UCs |
|-------|--------|-----|
| Session Lifecycle | SESS | 5 |
| Composition + Send | COMP | 5 |
| Message Rendering | RENDER | 7 |
| Mid-Turn Interactive Prompts | PAUSE | 3 |
| Platform Integration | PLATF | 5 |
| **Total** | | **25** |
