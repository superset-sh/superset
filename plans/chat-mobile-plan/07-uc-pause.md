---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.0.0
functional_group: PAUSE
---

# Use Cases: Mid-Turn Interactive Prompts (PAUSE)

| ID | Title | Description |
|----|-------|-------------|
| UC-PAUSE-01 | Respond to tool approval prompt | User can approve, decline, or always-allow a tool invocation via a bottom sheet that opens when the agent pauses. |
| UC-PAUSE-02 | Answer an ask_user question | User can submit a freeform text answer (and optionally pick from agent-provided options) via a bottom sheet. |
| UC-PAUSE-03 | Approve or reject a plan with optional feedback | User can approve or reject a submitted plan and attach optional feedback text via a bottom sheet. |

---

## UC-PAUSE-01: Respond to tool approval prompt

When the agent invokes a tool that requires approval, the session pauses and the mobile app opens a `@gorhom/bottom-sheet` modal containing the tool name, arguments preview, and three actions: **Approve**, **Decline**, **Always allow this category**. The user's choice is submitted via `chat.respondToApproval`. The sheet dismisses automatically on response. Inline collapsed `ToolCallBlock` cards in the message list reflect the resolved state after dismissal (consistent with desktop's `PendingApprovalMessage` → resolved transition).

**Acceptance Criteria:**
- ☐ User can see a bottom sheet open automatically when the agent pauses on a tool that requires approval
- ☐ User can see the tool name, a short description, and a preview of the tool arguments inside the sheet
- ☐ User can tap "Approve" to allow the tool invocation, "Decline" to refuse it, or "Always allow this category" to broaden approval
- ☐ System calls `chat.respondToApproval` over the relay with the user's decision and the session/workspace ids
- ☐ System dismisses the bottom sheet automatically after a successful response is acknowledged by the host
- ☐ User can swipe-down or tap a backdrop region to dismiss the sheet WITHOUT responding; the session remains paused and the sheet can be re-opened from the inline `PendingApprovalMessage` card
- ☐ System ensures all action buttons in the sheet are at least 44pt tall to meet WCAG mobile minimum hit targets

---

## UC-PAUSE-02: Answer an ask_user question

When the agent invokes the `ask_user` tool, a bottom sheet opens containing the question text, an optional list of suggested-answer pills (if the agent supplied them), and a multiline `TextInput` for freeform answers. User can tap a pill to populate the input, edit freely, and submit via a Send button. The response is sent through `chat.respondToQuestion`.

**Acceptance Criteria:**
- ☐ User can see a bottom sheet open automatically when the agent calls `ask_user` and the session pauses
- ☐ User can see the question text rendered prominently at the top of the sheet
- ☐ User can see a horizontal scroll row of suggested-answer pills when the agent supplied them, and tapping a pill populates the freeform input with the pill text
- ☐ User can type a freeform multiline answer in a `TextInput` inside the sheet
- ☐ User can tap a Send button (or use the keyboard send action) to submit the answer via `chat.respondToQuestion`
- ☐ System dismisses the sheet automatically once the host acknowledges the response
- ☐ User can swipe-down to dismiss the sheet WITHOUT responding; the session remains paused and the sheet can be re-opened from the inline `PendingQuestionMessage` card

---

## UC-PAUSE-03: Approve or reject a plan with optional feedback

When the agent submits a plan, a bottom sheet opens containing the plan markdown (rendered with the markdown renderer from UC-RENDER-03), an Approve action, a Reject action, and an expandable freeform feedback `TextInput`. Approve submits with empty feedback by default (feedback is optional on approval); Reject requires feedback to be non-empty before enabling the action. Response is sent via `chat.respondToPlan`.

**Acceptance Criteria:**
- ☐ User can see a bottom sheet open automatically when the agent submits a plan via the submit_plan tool
- ☐ User can see the plan rendered as markdown inside the sheet, scrollable within the sheet body
- ☐ User can tap "Approve" to accept the plan with empty (or optional) feedback
- ☐ User can tap "Reject" to refuse the plan; the Reject action is disabled until feedback text is non-empty
- ☐ User can expand an "Add feedback" section to type freeform feedback in a `TextInput`
- ☐ System calls `chat.respondToPlan` over the relay with the user's action and feedback text
- ☐ System dismisses the sheet automatically once the host acknowledges the response
- ☐ User can swipe-down to dismiss the sheet WITHOUT responding; the session remains paused and the sheet can be re-opened from the inline `PendingPlanApprovalMessage` card
