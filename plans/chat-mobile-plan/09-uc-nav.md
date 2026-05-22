---
stability: FEATURE_SPEC
last_validated: 2026-05-21
prd_version: 1.6.0
functional_group: NAV
---

# Use Cases: Navigation (NAV)

Shell-level navigation for the mobile chat surface — the **Chat** bottom-nav tab. Covers the sessions list (default landing), the host-picker bottom sheet, the new-chat workspace-picker FAB, push-notification deep-link routing, and empty states. **Resolves the previously-open Technical Sub-Decision #6** (host selection and workspace→host resolution) by adopting a Slack-style "one selected host at a time" model with sessions sectioned by workspace.

The Chat tab is a **new top-level surface** alongside the existing **Home/Workspaces**, **Tasks**, and **More** tabs. Workspace details (branch state, files, runs) stay in the existing Workspaces tab — out of scope for this PRD but the route hierarchy supports saddlepaddle's `workspaces/{id}` URL pattern for when those tabs ship later.

| ID | Title | Description | Container |
|----|-------|-------------|-----------|
| UC-NAV-01 | Sessions list is the Chat tab's default landing | User taps the Chat tab and sees a list of sessions scoped to the currently-selected host. | Stack screen |
| UC-NAV-02 | Sessions sectioned by workspace with collapse/expand | Sessions grouped under collapsible workspace headers (project · branch). | List sections |
| UC-NAV-03 | Switch active host via header-chip bottom sheet | User changes which host the sessions list (and downstream chat actions) target. | `@gorhom/bottom-sheet` |
| UC-NAV-04 | Start a new chat from the FAB → workspace picker | User initiates a new session by tapping the floating "+" button, choosing a workspace, and landing in an empty chat view. | FAB + `@gorhom/bottom-sheet` |
| UC-NAV-05 | Push-notification deep-link routes directly to chat view | Tapping a notification opens the relevant session and aligns the selected host so back-navigation lands in a consistent sessions list. | Route handler |
| UC-NAV-06 | Empty states (no hosts, no workspaces, no sessions) | First-launch and edge-state messaging guides the user to the next action. | In-list / screen states |

---

## Canonical wireframes

### A. Sessions list (Chat tab default landing) — UC-NAV-01, UC-NAV-02

```
┌──────────────────────────────────────┐
│ ☰  Sessions          [💻 macbook ▾] │  ← header: title + host chip
├──────────────────────────────────────┤
│                                      │
│  superset · chat-mobile-plan    ▾   │  ← workspace section header (tap = collapse)
│    ⌖ Chat-v2 design                  │  ← status icon + title
│      2m ago · streaming              │     meta line (relative time · state)
│    ● How chat works in Superset      │
│      18m ago                         │
│                                      │
│  JustinCode · main              ▾   │
│    ⚠ Auth refactor                   │  ← ⚠ = pause pending (approval/question/plan)
│      Tool approval pending           │
│    ● API cleanup                     │
│      1h ago                          │
│                                      │
│  LaneShadow · main              ▸   │  ← collapsed (chevron right)
│                                      │
│                              ╭───╮   │
│                              │ + │   │  ← FAB: opens UC-NAV-04 workspace picker
│                              ╰───╯   │
├──────────────────────────────────────┤
│  🏠      ✓       💬       ⋯         │  ← bottom tab nav
│  Home  Tasks   Chat     More         │     Chat is the new tab
└──────────────────────────────────────┘
```

**Status icons** on session rows:
- `⌖` streaming (assistant turn in progress)
- `⚠` pause pending (tool approval / `ask_user` / plan approval — UC-PAUSE-01/02/03)
- `●` idle / recently active
- `○` dormant (older, no recent activity)

### B. Host-picker bottom sheet — UC-NAV-03

```
[Tap host chip in header] ─►

┌──────────────────────────────────────┐
│       ◇ Switch host             ✕   │  ← sheet handle + close
├──────────────────────────────────────┤
│  This organization                   │
│                                      │
│  ✓  💻 macbook                online │  ← currently selected
│     Last active: 2m ago              │
│                                      │
│     ☁️  cloud-1               online │  ← tappable
│     3 workspaces · 12 sessions       │
│                                      │
│     💻 desktop              offline  │  ← tappable; selecting shows banner on list
│     Last seen: yesterday             │
└──────────────────────────────────────┘
```

### C. New-chat workspace picker — UC-NAV-04

```
[Tap FAB +] ─►

┌──────────────────────────────────────┐
│       ◇ Start a new chat        ✕   │
├──────────────────────────────────────┤
│  Pick a workspace on macbook         │
│                                      │
│     superset · chat-mobile-plan      │  ← sort by recent activity
│     5 sessions · 2m ago              │
│                                      │
│     superset · local-setup-no-env    │
│     3 sessions · 1h ago              │
│                                      │
│     JustinCode · main                │
│     2 sessions · yesterday           │
│                                      │
│     LaneShadow · main                │
│     no sessions yet                  │  ← empty workspaces still listed
└──────────────────────────────────────┘
```

### D. Deep-link routing — UC-NAV-05

```
Push notification arrives  (payload: { sessionId, workspaceId, hostId, kind })
         │
         ▼
[User taps notification]
         │
         ▼
App launches / foregrounds
         │
         ├── session.hostId ≠ selectedHost ──►  silently update selectedHost
         │                                              │
         ▼                                              │
Route to (chat)/[sessionId]  ◄──────────────────────────┘
         │
         ├── payload.kind == "approval" ───►  open UC-PAUSE-01 sticky footer
         ├── payload.kind == "question" ───►  open UC-PAUSE-02 bottom sheet
         ├── payload.kind == "plan"     ───►  open UC-PAUSE-03 pushed route
         │
         ▼
Chat view mounted
   Back button → sessions list (now scoped to correct host) ✓
```

### E. Empty states — UC-NAV-06

```
   No hosts                       No workspaces                   No sessions
   (UC-NAV-06.1)                  (UC-NAV-06.2)                   (UC-NAV-06.3)

┌────────────────────┐           ┌──────────────────────┐         ┌──────────────────────┐
│   Sessions         │           │ Sessions [💻 mac ▾]  │         │ Sessions [💻 mac ▾]  │
├────────────────────┤           ├──────────────────────┤         ├──────────────────────┤
│                    │           │                      │         │                      │
│     ╭────╮         │           │     ╭────╮           │         │     ╭────╮           │
│     │ ?? │         │           │     │ ── │           │         │     │ 💬 │           │
│     ╰────╯         │           │     ╰────╯           │         │     ╰────╯           │
│                    │           │                      │         │                      │
│  No devices yet    │           │  No workspaces       │         │  Start your first    │
│                    │           │  on this host        │         │      chat            │
│  Connect a device  │           │                      │         │                      │
│  from the          │           │  Create one on       │         │  Tap "+" below to    │
│  Workspaces tab    │           │  desktop             │         │  pick a workspace    │
│                    │           │                      │         │                      │
│ [Go to Workspaces] │           │  (mobile cannot      │         │              ╭───╮   │
│                    │           │  create workspaces)  │         │              │ + │   │
│                    │           │                      │         │              ╰───╯   │
└────────────────────┘           └──────────────────────┘         └──────────────────────┘
```

---

## UC-NAV-01: Sessions list is the Chat tab's default landing

The Chat tab opens to a sessions list scoped to the user's currently-selected host. The header has a screen title ("Sessions") and the host chip (UC-NAV-03 trigger). The body is sectioned by workspace (UC-NAV-02). A floating "+" action button is anchored bottom-right (UC-NAV-04 trigger). The bottom tab bar shows Home / Tasks / **Chat** / More.

**Acceptance Criteria:**
- ☐ User can tap the Chat tab in the bottom navigation to enter the chat surface
- ☐ User can see a sessions list as the default content of the Chat tab
- ☐ User can see a header containing the screen title "Sessions" and a host chip displaying the currently-selected host name with online/offline indicator
- ☐ User can see a floating "+" action button anchored bottom-right that opens the new-chat flow (UC-NAV-04)
- ☐ System scopes the sessions list to the user's `activeOrganizationId` AND the currently-selected `hostId`
- ☐ System restores the previously-selected host on app launch from local persisted storage
- ☐ System defaults the first-launch selected host to the host with the most-recent activity for this user when no persisted selection exists
- ☐ System renders the appropriate empty state when the list has zero rows per UC-NAV-06

---

## UC-NAV-02: Sessions sectioned by workspace with collapse/expand

Sessions are grouped under collapsible section headers showing `{project name} · {branch}`. Sections sort by `max(session.lastActiveAt)` within them, descending — most-recently-active workspace floats to the top. Within a section, sessions sort by `lastActiveAt` descending. Tapping a section header toggles expansion. Collapsed state persists locally per user+host. Empty workspaces (no sessions) appear as collapsed sections; expanding shows a "Start a chat here" inline affordance.

**Acceptance Criteria:**
- ☐ User can see each workspace as a section header with the format "{project name} · {branch}" above its sessions
- ☐ System sorts workspace sections by `max(session.lastActiveAt)` descending so the most-recently-active workspace appears at the top
- ☐ System sorts sessions within a workspace section by `lastActiveAt` descending
- ☐ User can tap a workspace section header to collapse the section so its sessions hide and the chevron rotates to the collapsed orientation
- ☐ User can tap a collapsed workspace section header to expand it so its sessions reappear
- ☐ System persists each workspace section's collapsed/expanded state locally, keyed by user and selected host, and restores it on next entry
- ☐ User can see an empty workspace section (no sessions) rendered collapsed by default with a "Start a chat here" affordance visible when expanded
- ☐ User can see status icons on session rows distinguishing streaming (`⌖`), pause-pending (`⚠`), idle (`●`), and dormant (`○`) states

---

## UC-NAV-03: Switch active host via header-chip bottom sheet

The host chip in the sessions list header opens a `@gorhom/bottom-sheet` listing all hosts the user has access to in the active organization (per `v2_users_hosts` joined to `v2_hosts`). The sheet shows each host's name, online state, and a meta line (last activity timestamp or session count). The current host is checkmarked. Tap-to-select closes the sheet and re-scopes the sessions list. Offline hosts remain selectable; selecting one triggers the offline banner from UC-PLATF-03 on the sessions list.

**Acceptance Criteria:**
- ☐ User can tap the host chip in the sessions list header to open the host-picker bottom sheet
- ☐ User can see the list of hosts available to them in the active organization, sourced from `v2_users_hosts` joined to `v2_hosts`
- ☐ User can see each host row labeled with the host name, an online/offline state badge, and a meta line (last activity timestamp or session count)
- ☐ User can see the currently-selected host indicated with a check mark or equivalent affordance
- ☐ User can tap a host row to select it; the sheet closes automatically and the sessions list refreshes scoped to the new host
- ☐ System persists the selected host locally, keyed by `userId` + `organizationId`, and restores it on app launch
- ☐ User can swipe-down or tap a backdrop region to dismiss the sheet without changing the selected host
- ☐ User can see an offline host as selectable; selecting it surfaces the "Host offline" banner from UC-PLATF-03 on the sessions list and disables Send per the same UC

---

## UC-NAV-04: Start a new chat from the FAB → workspace picker

Tapping the floating "+" action button opens a workspace-picker bottom sheet listing the user's workspaces on the currently-selected host (`v2_workspaces` filtered by `hostId` and `organizationId`). Each row shows the project name, branch, and a meta line (session count + most-recent activity). Selecting a workspace creates a session via cloud `chat.createSession` (see UC-SESS-03 for the backend contract) and navigates the user directly into the empty chat view.

**Acceptance Criteria:**
- ☐ User can tap the floating "+" action button on the sessions list to open a workspace-picker bottom sheet
- ☐ User can see all workspaces on the currently-selected host listed in the picker, sorted by most-recent activity (workspaces with sessions ranked above empty workspaces)
- ☐ User can see each workspace row labeled with the project name, branch, and a meta line showing session count and the most-recent activity timestamp
- ☐ User can tap a workspace row to begin a new session in that workspace
- ☐ System calls cloud `chat.createSession({ sessionId, v2WorkspaceId })` when a workspace is selected — see UC-SESS-03 for the backend contract
- ☐ System navigates the user directly into the empty chat view for the new session once `chat.createSession` succeeds
- ☐ User can swipe-down or tap a backdrop region to dismiss the picker without creating a session
- ☐ User can see an empty-state message inside the picker when the selected host has zero workspaces, with copy explaining workspace creation happens on desktop

---

## UC-NAV-05: Push-notification deep-link routes directly to chat view

The push notification payload includes `{ sessionId, workspaceId, hostId, kind }`. Tapping the notification launches or foregrounds the app and routes to `(chat)/[sessionId]` regardless of which tab or screen was active. If the session's host differs from the currently-selected host, the selected host is silently updated *before* the chat view mounts so that back-navigation to the sessions list lands in a consistent host scope. If `kind` indicates an active pause (`"approval" | "question" | "plan"`), the appropriate container from UC-PAUSE-01/02/03 opens immediately after the chat view mounts.

**Acceptance Criteria:**
- ☐ User can tap a push notification to open the app and navigate directly to the chat view for the session referenced in the notification payload
- ☐ System routes to `(chat)/[sessionId]` regardless of which tab was active when the notification was tapped
- ☐ System silently updates the locally-selected host to match the session's host before mounting the chat view when they differ
- ☐ User can tap the back button or gesture from the chat view and land on a sessions list scoped to the host of the just-viewed session
- ☐ System opens the appropriate pause container immediately after the chat view mounts when the notification payload's `kind` is "approval" (UC-PAUSE-01), "question" (UC-PAUSE-02), or "plan" (UC-PAUSE-03)
- ☐ User can see a "Session unavailable" banner on the chat view when the host is offline or the session has been deleted between notification dispatch and tap, with a return-to-sessions-list affordance

---

## UC-NAV-06: Empty states (no hosts, no workspaces, no sessions)

Three distinct empty states for the chat surface, distinguished by which level of the data hierarchy is empty:

- **UC-NAV-06.1 — No hosts**: user has zero `v2_users_hosts` rows in the active organization (brand-new mobile user before any device registration). Render a primary CTA pointing to the Workspaces tab where the user can connect a device. The host chip in the header is omitted (no host to display).
- **UC-NAV-06.2 — No workspaces on selected host**: the host exists but has zero `v2_workspaces`. Render copy explaining that workspaces are created on desktop. The host chip remains in the header so the user can switch to another host.
- **UC-NAV-06.3 — No sessions across all workspaces on selected host**: workspaces exist but contain no sessions. Show the FAB visually emphasized (slightly larger or accented) and copy guiding the user to start their first chat.

**Acceptance Criteria:**
- ☐ User can see a "no devices yet" empty state on the sessions list when they have zero accessible hosts in the active organization, with a CTA linking to the Workspaces tab and the host chip omitted from the header
- ☐ User can see a "no workspaces on this host" empty state when the selected host has zero workspaces, with copy explaining workspace creation happens on desktop and the host chip retained in the header
- ☐ User can see a "no sessions yet" empty state when workspaces exist but contain zero sessions, with the FAB visually emphasized and copy guiding the user to tap it to start their first chat
- ☐ System distinguishes between these three states programmatically based on the result counts of the host, workspace, and session queries — never falls back to a blank screen
