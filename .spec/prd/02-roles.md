---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-19
prd_version: 1.0.0
---

# User Roles

The initiative serves several distinct Superset roles. Each acceptance criterion in the use case files references the role explicitly using these names.

| Role | Description |
|------|-------------|
| **User** | The day-to-day Superset user inside the desktop app — opens browser/chat/terminal panes, kicks off automations, runs `superset auth login` for their workstation. Default actor for every UC unless another role is named. |
| **Remote User** | A user whose CLI is running on a remote machine (SSH session, EC2, Codespace) and whose browser is on a different device. Specific actor for UC-CLI-02 cross-device login scenarios. |
| **Automation Operator** | The user who configures and supervises automations — picks workspaces or "New workspace" targets, watches `PreviousRunsList`, reads failure copy. Specific actor for UC-AUTO-01 and UC-AUTO-02. |
| **Reviewer** | The user reading code in the diff viewer (during agent review or peer review). Specific actor for UC-UX-02 diff-viewer numbering. |
| **Engineer (Internal)** | Superset engineering reading the canonical chat-architecture doc and downstream TRD. Specific actor for the documentation-producing AC in UC-CHAT-01. |
| **System** | The Superset runtime — host service, CLI, relay, cloud router, desktop main + renderer processes. Specific actor for behaviors that happen without direct user action (auth refresh, event emission, dispatch). |
