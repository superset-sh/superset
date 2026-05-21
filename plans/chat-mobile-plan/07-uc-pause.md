---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.1.0
functional_group: PAUSE
---

# Use Cases: Mid-Turn Interactive Prompts (PAUSE)

| ID | Title | Description | Container |
|----|-------|-------------|-----------|
| UC-PAUSE-01 | Respond to tool approval prompt | User can approve, decline, or always-allow a tool invocation via an inline card + sticky thumb-docked action footer. | Inline card + sticky footer |
| UC-PAUSE-02 | Answer an ask_user question | User can submit a freeform text answer (and optionally pick from agent-provided pills) via a bottom sheet with keyboard-aware TextInput. | Bottom sheet (`@gorhom/bottom-sheet`) |
| UC-PAUSE-03 | Approve or reject a plan with optional feedback | User can review long-form plan markdown and approve or reject with optional feedback via a full-screen modal pushed as an expo-router route. | Full-screen modal (pushed route) |
| UC-PAUSE-04 | Floating pending-action indicator | User can see a "Tap to respond" pill near the chat input when a pause is active off-screen, and tap it to return to the relevant container. | Floating pill |

The three primary pause states use **different containers chosen per interaction shape**. See the Design Rationale section at the bottom of this file for the full evidence trail and citations.

---

## UC-PAUSE-01: Respond to tool approval prompt

**Container: Inline card in the message stream + sticky thumb-docked action footer.**

When the agent invokes a tool that requires approval, the session pauses and the mobile app renders a `PendingApprovalCard` inline in the message stream at the position where the desktop `PendingApprovalMessage` would appear. The card shows the tool name, a short description, and a preview of the tool arguments. Simultaneously, a sticky `PendingApprovalFooter` slides up to sit above the chat input — containing **Approve**, **Decline**, and **Always-allow-category** buttons at 44pt height for thumb reach. When multiple approvals are pending in the same session, the footer shows a "1 of N" indicator and acts on the most recent unresolved request first. The user can scroll up to read context above the pending approval without losing access to the footer buttons.

**Acceptance Criteria:**
- ☐ User can see a `PendingApprovalCard` rendered inline in the message stream when the agent pauses on a tool requiring approval
- ☐ User can see the tool name, a short description, and a preview of the tool arguments inside the inline card
- ☐ System renders a sticky `PendingApprovalFooter` positioned above the chat input containing Approve, Decline, and Always-allow-category buttons while a pending approval is active
- ☐ User can tap Approve, Decline, or Always-allow-category from the sticky footer at any scroll position
- ☐ System calls `chat.respondToApproval` over the relay with the user's decision and the session and workspace ids on action
- ☐ User can see the footer dismiss automatically once the host acknowledges the response
- ☐ User can see the inline card transition from `PendingApprovalCard` to a resolved `ToolCallBlock` (collapsed) once the response is acknowledged
- ☐ System ensures all action buttons in the footer are at least 44pt tall to meet WCAG mobile minimum hit targets
- ☐ User can see a "1 of N" indicator in the footer when multiple approvals are pending, with the footer acting on the most recent unresolved request first
- ☐ User can scroll up to read context above the pending approval without the footer disappearing from view

---

## UC-PAUSE-02: Answer an ask_user question

**Container: Bottom sheet with keyboard-aware TextInput.**

When the agent invokes the `ask_user` tool, a `@gorhom/bottom-sheet` opens containing the question text, an optional horizontal-scroll row of suggested-answer pills (if the agent supplied them), and a multiline `BottomSheetTextInput` for freeform answers. The user can tap a pill to pre-populate the input, edit freely, and submit via a Send button. The response goes to `chat.respondToQuestion`. The keyboard reveals smoothly because `@gorhom/bottom-sheet`'s `BottomSheetTextInput` handles keyboard avoidance natively on both iOS and Android — the decisive factor in choosing a sheet over an inline pattern for this state.

**Acceptance Criteria:**
- ☐ User can see a bottom sheet open automatically when the agent calls `ask_user` and the session pauses
- ☐ User can see the question text rendered prominently at the top of the sheet
- ☐ User can see a horizontal scroll row of suggested-answer pills when the agent supplied them, and tapping a pill populates the freeform input with the pill text
- ☐ User can type a freeform multiline answer in a `BottomSheetTextInput` inside the sheet with the keyboard sized correctly above the sheet
- ☐ User can tap a Send button (or use the keyboard send action) to submit the answer via `chat.respondToQuestion`
- ☐ System dismisses the sheet automatically once the host acknowledges the response
- ☐ User can swipe-down to dismiss the sheet WITHOUT responding; the session remains paused and the pending-action indicator (UC-PAUSE-04) surfaces

---

## UC-PAUSE-03: Approve or reject a plan with optional feedback

**Container: Full-screen modal pushed as an expo-router route.**

When the agent submits a plan, the mobile app pushes a new screen via expo-router at `(authenticated)/chat/[sessionId]/plan-review/[planId]`, presented as a full-screen modal (`presentation: 'modal'` in the route options). The screen renders the plan markdown with the UC-RENDER-03 markdown renderer in a full-height scroll view. Approve / Reject buttons dock at the bottom of the screen above the safe area. An expandable "Add feedback" section between the markdown and the buttons reveals a `TextInput` for freeform feedback. Approve accepts the plan with optional empty feedback; Reject requires non-empty feedback before enabling. Response goes to `chat.respondToPlan`.

**Acceptance Criteria:**
- ☐ User can see a full-screen modal screen presented when the agent submits a plan via the submit_plan tool
- ☐ User can see the plan rendered as markdown by the same renderer used in UC-RENDER-03 inside the scrollable body of the screen
- ☐ User can scroll the plan markdown vertically within the screen body across multiple screen-heights of content
- ☐ User can tap "Approve" docked at the bottom to accept the plan with empty or optional feedback
- ☐ User can tap "Reject" docked at the bottom to refuse the plan; the Reject action is disabled until feedback text is non-empty
- ☐ User can expand an "Add feedback" section to type freeform feedback in a `TextInput` on the screen
- ☐ System calls `chat.respondToPlan` over the relay with the user's action and feedback text
- ☐ System dismisses the plan review screen automatically once the host acknowledges the response and returns the user to the chat view
- ☐ User can tap a close affordance (X) in the screen's header to dismiss WITHOUT responding; the session remains paused and the pending-action indicator (UC-PAUSE-04) surfaces

---

## UC-PAUSE-04: Floating pending-action indicator

**Container: Floating pill near the chat input.**

When a session has any active pause (tool approval, `ask_user`, or plan approval) AND the user has scrolled away from the relevant inline card OR dismissed the sheet/modal without responding, a floating `PendingActionIndicator` pill surfaces near the chat input with copy like "1 pending — tap to respond." Tapping the pill:
- For tool approval pauses: scrolls the message list back to the pending `PendingApprovalCard` and keeps the sticky footer visible
- For ask_user pauses: re-opens the bottom sheet from UC-PAUSE-02
- For plan approval pauses: re-pushes the modal route from UC-PAUSE-03

The indicator hides automatically when the pause is resolved or the relevant card returns to view.

**Acceptance Criteria:**
- ☐ User can see a floating "Tap to respond" pill near the chat input when a session has a pending pause and the relevant card is not currently in view
- ☐ User can tap the indicator pill to scroll back to the pending approval card when the pause is a tool approval
- ☐ User can tap the indicator pill to re-open the ask_user bottom sheet when the pause is an ask_user question that was previously dismissed
- ☐ User can tap the indicator pill to re-push the plan review screen when the pause is a plan approval that was previously dismissed
- ☐ System hides the indicator pill automatically when the pending pause is resolved or the relevant card returns to view
- ☐ System renders the indicator with sufficient contrast and an animated entry and exit (Reanimated `FadeIn` / `FadeOut`) to draw attention without being aggressive

---

## Design Rationale (the WHY for container choices)

The original draft of this PRD specified all three pause states as bottom sheets. Research and product review (2026-05-21) revealed this was a defensible default but not the best UX for each individual interaction shape. The three pause states are functionally distinct, occur at different frequencies, have different content lengths, and have different input needs — and accepted mobile-UX literature points to different containers for each.

### Container choice framework

| Container | Apple HIG framing | Mobile best-practice fit |
|---|---|---|
| Inline card + sticky footer | "Contextual in-place affordance" | Frequent, low-friction decisions where context preservation matters |
| Bottom sheet | "Narrowly-scoped task that benefits from focus" | One-off interactions, especially those needing the keyboard |
| Full-screen modal / pushed route | "In-depth content or a task that involves multiple steps" | Long-form content review, multi-step decisions |
| iOS-style permission alert | "Critical information requiring immediate action" | OS-level destructive actions only — explicitly rejected for agent prompts |

### UC-PAUSE-01 (tool approval) → inline card + sticky footer

Tool approvals can occur 3–10 times per session in real agent workflows. Stacking 10 sequential bottom-sheet pop-ups would be brutal UX and would repeatedly tear the user away from the conversation that triggered each approval.

**Citations:**
- **Continue.dev** ([Agent Mode Quick Start](https://docs.continue.dev/ide-extensions/agent/quick-start)) — the closest peer product (AI coding agent with synchronous tool approvals) ships **inline approval buttons in the chat interface**, not a separate modal sheet. Their rationale, validated through extensive developer use: preserving conversation context is more valuable than focused-task isolation when the user is approving an action *based on the message stream's contents*.
- **Nielsen Norman Group — [Permission Request Design](https://www.nngroup.com/articles/permission-requests)** — research shows contextually-framed permission requests yield 12–81% higher grant rates than system-initiated prompts. Tool approval is fundamentally a permission decision; surfacing it *inside* the conversation that triggered it is more contextual than ripping the user into a modal.
- **Apple HIG — [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)** — explicitly cautions against modal interruption for routine decisions, recommending modal containers only for "narrowly-scoped" or "critical" interactions.

The sticky thumb-docked footer addresses the legitimate concern (raised in the design audit, `plans/20260521-mobile-chat-design-audit.md` §6) that desktop's `py-1 px-2` (8pt) approval buttons are below the WCAG 44pt mobile minimum. The footer ensures 44pt buttons are always at thumb height regardless of scroll position, *without* needing a modal container to achieve that.

### UC-PAUSE-02 (ask_user) → bottom sheet

The deciding factor is the keyboard. An inline `TextInput` in a chat stream fights keyboard reveal hard, especially on Android where `KeyboardAvoidingView` is unreliable. `@gorhom/bottom-sheet`'s `BottomSheetTextInput` handles keyboard avoidance natively and cleanly on both platforms.

**Citations:**
- **Apple HIG — [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)** — sheets are recommended for "a distinct, narrowly scoped task that helps people focus." A single freeform-text question is exactly this shape.
- **Material Design 3 — [Bottom Sheets](https://m3.material.io/components/bottom-sheets/guidelines)** — modal bottom sheets are the standard for focused decisions on Material; they block parent content as modals while remaining non-intrusive vs full-screen.

ask_user interactions are typically one-off per turn (the agent doesn't repeatedly call ask_user during a single response), so the modal-frequency concern from UC-PAUSE-01 does not apply.

### UC-PAUSE-03 (plan approval) → full-screen modal (pushed route)

Plans can span multiple screens of markdown. A bottom sheet caps at ~85% screen height and the inner scroll inherently fights the sheet's own dismiss-on-pan gesture (a documented UX issue with stacked scrollable content in modal sheets).

**Citations:**
- **Apple HIG — [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)** — explicitly recommends full-screen modals for "in-depth content or a task that involves multiple steps." Reviewing a multi-step plan markdown matches this framing exactly.
- **Material Design 3** — also distinguishes between bottom sheets (focused, contextual) and full-screen modals (in-depth, multi-step) along the same axis.

Using an expo-router pushed route (rather than a JS-driven modal overlay) gives the plan its own URL surface, navigation header, proper back-button semantics, and the option to deep-link from a push notification (UC-PLATF-01) directly into plan review.

### UC-PAUSE-04 (pending-action indicator) — new addition

Without this affordance, a user who scrolls away from a tool-approval card or dismisses a sheet/modal would have no efficient way back to the pause point, and the session would stall silently. The indicator is a small floating pill — minimal visual weight, but ensures the user can always re-enter a pending interaction.

**Citation:** **Nielsen Norman Group — [Permission Request Design](https://www.nngroup.com/articles/permission-requests)** — emphasizes that users should always have a clear path back to a deferred decision; abandoning permission requests silently destroys trust in the prompt system.

### Patterns explicitly considered and rejected

- **iOS-style system permission alert (centered modal, dimmed backdrop).** Apple HIG ([Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)) reserves these for "critical information requiring immediate action" and OS permissions. Agent tool approvals are not system permissions; using the alert pattern would inappropriately escalate perceived weight and feel jarring after the first occurrence.
- **iOS action sheet (native slide-up menu from bottom).** Closer to right for tool approval but constrained to ~5 plain-string actions, no rich content/argument preview, and tap-anywhere-to-dismiss. Inappropriate for displaying tool arguments and rationale.
- **Bottom sheet for tool approval** (the original PRD proposal). Rejected after research: the [Continue.dev](https://docs.continue.dev/ide-extensions/agent/quick-start) inline pattern and [NN/G context-preservation research](https://www.nngroup.com/articles/permission-requests) are decisive against repeated-modal-pop-up UX for frequent decisions.

### Future-state escape hatch (future mobile-chat PRD, not mobile-chat v2)

If mobile users report approval fatigue, the next iteration should adopt **[Cline's auto-approve categories pattern](https://docs.cline.bot/features/auto-approve)** — pre-configure approval categories in user settings (e.g., "always allow `bun install` in safe workspaces", "always allow file reads under workspace root"). This reduces approval frequency dramatically without compromising the security model. Worth considering in a follow-up PRD; outside mobile-chat v2 scope.

### Sources

| Source | URL | Used For |
|---|---|---|
| Apple HIG — Modality | https://developer.apple.com/design/human-interface-guidelines/modality | Container-shape framework; sheets vs full-screen vs alerts |
| Apple HIG — Privacy | https://developer.apple.com/design/human-interface-guidelines/privacy | Why agent approvals are NOT system-permission alerts |
| Nielsen Norman Group — Permission Requests | https://www.nngroup.com/articles/permission-requests | Context-preservation research; 12–81% grant-rate lift from contextual framing |
| Continue.dev — Agent Mode | https://docs.continue.dev/ide-extensions/agent/quick-start | Peer-product inline tool-approval pattern |
| Cline — Auto Approve & YOLO Mode | https://docs.cline.bot/features/auto-approve | Future-state escape hatch (settings-based pre-approval) |
| Material Design 3 — Bottom Sheets | https://m3.material.io/components/bottom-sheets/guidelines | Sheet-vs-dialog distinction for Android parity |
| Design audit (Superset, this branch's predecessor) | `plans/20260521-mobile-chat-design-audit.md` on `local-setup-no-env` @ commit `f3e68314b` | 44pt hit-target requirement; FlashList + Reanimated availability |
