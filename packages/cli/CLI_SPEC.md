# Superset CLI Spec

Two types of commands: **cloud** (hits API directly) and **device** (routes to API, which emits a websocket event to the specific host service).

Default output is human-friendly (text, tables). `--json` flag returns structured data (for agents/scripting).

### Device auto-detection

The host service writes `~/.superset/device.json` on startup:
```json
{ "deviceId": "47e890a2...", "deviceName": "Satyas-MacBook-Pro" }
```

All device commands use this as the default. `--device` overrides it for remote control. If no local device is found and `--device` is omitted, the CLI errors with "no local device found, use --device".

---

## Global Flags

```
--json        Structured JSON output
--quiet       IDs only (for piping)
--device      Override device (default: auto-detected from ~/.superset/device.json)
--api-url     Override API URL
```

---

## `superset auth`

### `superset auth login`
Opens browser to authenticate and store API key.

**Human output:**
```
Logged in as Satya Patel (satya@superset.sh)
Organization: Superset
```

**`--json`:**
```json
{ "userId": "...", "email": "satya@superset.sh", "name": "Satya Patel", "organizationId": "...", "organizationName": "Superset" }
```

### `superset auth logout`
Clears stored credentials.

**Human output:**
```
Logged out.
```

**`--json`:**
```json
{ "success": true }
```

### `superset auth whoami`

**Human output:**
```
Satya Patel (satya@superset.sh)
Organization: Superset
```

**`--json`:**
```json
{ "userId": "...", "email": "satya@superset.sh", "name": "Satya Patel", "organizationId": "...", "organizationName": "Superset" }
```

---

## `superset devices` (cloud)

### `superset devices list`
```
Input:  --include-offline (optional, default: false)
```

**Human output:**
```
NAME                   TYPE      STATUS    LAST SEEN
Kunals-MacBook-Pro     desktop   online    2m ago
Satyas-MacBook-Pro     desktop   online    just now
Thrives-MacBook-Pro    desktop   offline   3d ago
```

**`--json`:**
```json
{
  "data": [{
    "deviceId": "47e890a2...",
    "deviceName": "Kunals-MacBook-Pro",
    "deviceType": "desktop",
    "isOnline": true,
    "lastSeenAt": "2026-04-03T17:43:19Z",
    "userId": "...",
    "userName": "Kunal"
  }]
}
```

---

## `superset tasks` (cloud)

### `superset tasks list`
```
Input:
  --status <type>        "backlog" | "todo" | "in_progress" | "done" | "cancelled"
  --assignee-me          filter to my tasks
  --creator-me           filter to tasks I created
  --priority <p>         "urgent" | "high" | "medium" | "low" | "none"
  --search <query>
  --labels <label,...>
  --limit <n>            default 50
  --offset <n>
```

**Human output:**
```
SLUG          TITLE                    STATUS        PRIORITY   ASSIGNEE
SUP-42        Fix auth redirect        in_progress   high       Satya
SUP-41        Add SCIM support         todo          medium     —
SUP-40        Update landing page      done          low        Kiet
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "slug": "SUP-42",
    "title": "Fix auth redirect",
    "description": "...",
    "status": { "id": "...", "name": "In Progress", "type": "in_progress", "color": "#..." },
    "priority": "high",
    "assigneeId": "...",
    "creatorId": "...",
    "labels": [],
    "branch": "fix-auth-redirect",
    "prUrl": null,
    "dueDate": null,
    "createdAt": "2026-04-01T...",
    "updatedAt": "2026-04-03T..."
  }]
}
```

### `superset tasks get <idOrSlug>`
```
Input:  <idOrSlug>       UUID or slug
```

**Human output:**
```
SUP-42: Fix auth redirect
Status:    In Progress (high)
Assignee:  Satya Patel
Branch:    fix-auth-redirect
Created:   Apr 1, 2026

The OAuth redirect is broken when...
```

**`--json`:**
```json
{ "data": { ... } }
```
Same shape as list item.

### `superset tasks create`
```
Input:
  --title <title>        required
  --description <text>
  --status <statusId>
  --priority <p>
  --assignee <userId>
  --labels <label,...>
  --branch <branch>
  --due-date <date>
```

**Human output:**
```
Created task SUP-43: Deploy monitoring
```

**`--json`:**
```json
{ "data": { ... } }
```

### `superset tasks update <idOrSlug>`
```
Input:
  --title <title>
  --description <text>
  --status <statusId>
  --priority <p>
  --assignee <userId>
  --labels <label,...>
  --branch <branch>
  --due-date <date>
```

**Human output:**
```
Updated task SUP-42
```

**`--json`:**
```json
{ "data": { ... } }
```

### `superset tasks delete <idOrSlug>`

**Human output:**
```
Deleted task SUP-42
```

**`--json`:**
```json
{ "success": true }
```

---

## `superset projects` (device)

### `superset projects list`
```
Input:  --device <deviceId>    optional, auto-detected
```

**Human output:**
```
NAME              SLUG              REPO
superset          superset          superset-sh/superset
marketing         marketing         superset-sh/marketing
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "name": "superset",
    "slug": "superset",
    "githubRepositoryId": "..."
  }]
}
```

---

## `superset workspaces` (device)

### `superset workspaces list`
```
Input:  --device <deviceId>    optional, auto-detected
```

**Human output:**
```
NAME                BRANCH              PROJECT
fix-auth            fix-auth-redirect   superset
main                main                marketing
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "name": "fix-auth",
    "branch": "fix-auth-redirect",
    "projectId": "...",
    "projectName": "superset"
  }]
}
```

### `superset workspaces get`
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
```

**Human output:**
```
Workspace: fix-auth (branch: fix-auth-redirect)
Project:   superset

TABS & PANES:
  Tab 1:
    terminal  "claude-session"     running
    terminal  "shell"              idle
  Tab 2:
    chat      "Debug auth flow"    active
```

**`--json`:**
```json
{
  "data": {
    "id": "...",
    "name": "fix-auth",
    "branch": "fix-auth-redirect",
    "projectId": "...",
    "tabs": [{
      "id": "...",
      "name": "Tab 1",
      "panes": [{
        "id": "...",
        "kind": "terminal",
        "name": "claude-session",
        "status": "running"
      }]
    }]
  }
}
```

### `superset workspaces create`
```
Input:
  --device <deviceId>      optional, auto-detected
  --project <projectId>    required
  --name <name>            required
  --branch <branch>        required
```

**Human output:**
```
Created workspace "fix-auth" on Satyas-MacBook-Pro
```

**`--json`:**
```json
{ "data": { "id": "...", "name": "fix-auth", "branch": "fix-auth-redirect", "projectId": "..." } }
```

### `superset workspaces update`
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --name <name>
  --branch <branch>
```

**Human output:**
```
Updated workspace "fix-auth"
```

**`--json`:**
```json
{ "data": { ... } }
```

### `superset workspaces delete`
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
```

**Human output:**
```
Deleted workspace "fix-auth"
```

**`--json`:**
```json
{ "success": true }
```

### `superset workspaces switch`
Switches the active workspace on a device.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
```

**Human output:**
```
Switched to workspace "fix-auth" on Satyas-MacBook-Pro
```

**`--json`:**
```json
{ "success": true }
```

---

## `superset agent` (device)

### `superset agent start`
Launches an agent session.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --task <taskId>              optional, task to work on
  --prompt <text>              optional, free-form prompt (or --prompt-file)
  --prompt-file <path>         optional, read prompt from file
  --pane <paneId>              optional, scopes to existing tab
  --agent <type>               "claude" | "codex" | "gemini" | ... (default: "claude")
```
At least one of `--task` or `--prompt`/`--prompt-file` is required.

**Human output:**
```
Started claude agent on Satyas-MacBook-Pro
Terminal: trm_abc123
```

**`--json`:**
```json
{ "data": { "commandId": "...", "terminalId": "trm_abc123", "status": "completed" } }
```

---

## `superset ui` (device)

Commands for controlling the desktop app UI on a device.

### `superset ui focus`
Navigate to a page in the desktop app.
```
Input:
  --device <deviceId>          optional, auto-detected
  --page <page>                required, e.g. "workspace", "settings", "tasks", "integrations"
  --workspace <workspaceId>    optional, for workspace page
  --tab <tabId>                optional, focus specific tab
  --pane <paneId>              optional, focus specific pane
```

**Human output:**
```
Focused workspace "fix-auth" on Satyas-MacBook-Pro
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui sidebar list`
List workspaces registered in the sidebar.
```
Input:
  --device <deviceId>          optional, auto-detected
```

**Human output:**
```
SECTION         WORKSPACE           PROJECT
Active          fix-auth            superset
Active          main                marketing
Archived        old-experiment      superset
```

**`--json`:**
```json
{
  "data": [{
    "section": "Active",
    "workspaceId": "...",
    "workspaceName": "fix-auth",
    "projectName": "superset"
  }]
}
```

### `superset ui sidebar add`
Register a workspace in the sidebar.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --section <name>             optional, sidebar section to add to
```

**Human output:**
```
Added "fix-auth" to sidebar section "Active"
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui sidebar remove`
Remove a workspace from the sidebar.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
```

**Human output:**
```
Removed "fix-auth" from sidebar
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui sidebar move`
Move a workspace to a different sidebar section.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --section <name>             required
```

**Human output:**
```
Moved "fix-auth" to section "Archived"
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui sidebar sections list`
List sidebar sections.
```
Input:
  --device <deviceId>          optional, auto-detected
```

**Human output:**
```
NAME          POSITION
Active        1
Archived      2
```

**`--json`:**
```json
{ "data": [{ "id": "...", "name": "Active", "position": 1 }] }
```

### `superset ui sidebar sections create`
```
Input:
  --device <deviceId>          optional, auto-detected
  --name <name>                required
  --position <n>               optional
```

**Human output:**
```
Created section "Sprint 42"
```

**`--json`:**
```json
{ "data": { "id": "...", "name": "Sprint 42", "position": 3 } }
```

### `superset ui sidebar sections delete`
```
Input:
  --device <deviceId>          optional, auto-detected
  --section <sectionId>        required
```

**Human output:**
```
Deleted section "Sprint 42"
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui tabs create`
Create a new tab in a workspace.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --name <name>                optional
```

**Human output:**
```
Created tab "Tab 3" in workspace "fix-auth"
```

**`--json`:**
```json
{ "data": { "id": "...", "name": "Tab 3" } }
```

### `superset ui tabs delete`
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --tab <tabId>                required
```

**Human output:**
```
Deleted tab "Tab 3"
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui panes create`
Create a new pane in a tab.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --tab <tabId>                required
  --kind <kind>                required, "terminal" | "chat" | "browser"
  --split <direction>          optional, "horizontal" | "vertical"
```

**Human output:**
```
Created terminal pane in tab "Tab 1"
```

**`--json`:**
```json
{ "data": { "id": "...", "kind": "terminal", "tabId": "..." } }
```

### `superset ui panes delete`
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
```

**Human output:**
```
Deleted pane
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui panes resize`
Adjust pane layout proportions.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --width <percent>            optional, 0-100
  --height <percent>           optional, 0-100
```

**Human output:**
```
Resized pane to 60% width
```

**`--json`:**
```json
{ "success": true }
```

### Pane-type-specific commands

#### Terminal panes

### `superset ui panes terminal send`
Send input to a terminal pane.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --input <text>               required
```

**Human output:**
```
Sent to terminal pane
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui panes terminal read`
Read recent output from a terminal pane.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --lines <n>                  optional, default 50
```

**Human output:**
```
[raw terminal output]
```

**`--json`:**
```json
{ "data": { "output": "..." } }
```

#### Browser panes

### `superset ui panes browser navigate`
Navigate a browser pane to a URL.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --url <url>                  required
```

**Human output:**
```
Navigated to https://example.com
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui panes browser get`
Get current state of a browser pane.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
```

**Human output:**
```
URL:    https://example.com/dashboard
Title:  Dashboard - Example
```

**`--json`:**
```json
{ "data": { "url": "https://example.com/dashboard", "title": "Dashboard - Example" } }
```

#### Chat panes

### `superset ui panes chat send`
Send a message to a chat pane.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --message <text>             required (or --message-file)
  --message-file <path>        optional, read message from file
```

**Human output:**
```
Sent message to chat pane
```

**`--json`:**
```json
{ "success": true }
```

### `superset ui panes chat read`
Read recent messages from a chat pane.
```
Input:
  --device <deviceId>          optional, auto-detected
  --workspace <workspaceId>    required
  --pane <paneId>              required
  --limit <n>                  optional, default 20
```

**Human output:**
```
[user]  Fix the auth redirect bug
[ai]    I'll look into the OAuth redirect flow...
[user]  Focus on the callback handler
```

**`--json`:**
```json
{
  "data": [{
    "role": "user",
    "content": "Fix the auth redirect bug",
    "timestamp": "2026-04-03T..."
  }]
}
```

---

## `superset chat` (cloud, needs new tRPC query)

### `superset chat list`
Lists chat sessions for the current user in the org.
```
Input:
  --workspace <workspaceId>    optional filter
  --limit <n>                  default 50
```

**Human output:**
```
TITLE                    WORKSPACE      LAST ACTIVE
Debug auth flow          fix-auth       2m ago
Plan CLI spec            main           1h ago
—                        —              3d ago
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "title": "Debug auth flow",
    "v2WorkspaceId": "...",
    "lastActiveAt": "2026-04-03T...",
    "createdAt": "2026-04-03T..."
  }]
}
```

### `superset chat create`
```
Input:
  --workspace <workspaceId>    optional
  --title <title>              optional
```

**Human output:**
```
Created chat session "Debug auth flow"
```

**`--json`:**
```json
{ "data": { "id": "...", "title": "Debug auth flow", "v2WorkspaceId": "..." } }
```

### `superset chat delete <id>`

**Human output:**
```
Deleted chat session.
```

**`--json`:**
```json
{ "success": true }
```

---

## `superset notifications` (cloud)

Inbox cards. Can optionally include a rich body with structured content and staged actions. Creating a notification can trigger an OS/push notification. Org-scoped — accessible from any device.

When dismissed, the body goes with it. Agents can update notifications (e.g. to react to human feedback).

### `superset notifications list`
```
Input:
  --unread                     optional, filter to unread only
  --limit <n>                  default 50
```

**Human output:**
```
TITLE                              TIME        STATUS
Input needed: file access          2m ago      unread
Finished task SUP-42               15m ago     unread
PR ready for review                1h ago      read
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "title": "Input needed: file access",
    "subtitle": "Requesting access to /src/auth/callback.ts",
    "icon": "alert",
    "hasBody": false,
    "link": { "type": "pane", "workspaceId": "...", "paneId": "...", "deviceId": "..." },
    "read": false,
    "createdAt": "2026-04-03T..."
  }]
}
```

### `superset notifications get <id>`
```
Input:  <id>
```

**Human output (simple card):**
```
Input needed: file access
Requesting access to /src/auth/callback.ts
Workspace: fix-auth
Time:      2m ago
```

**Human output (with rich body):**
```
PR ready for review
3 files changed
Time: 1h ago

## Changes
- Refactored OAuth callback handler
- Added error handling for expired tokens

## Files Modified
  src/auth/callback.ts (+45, -12)
  src/auth/tokens.ts (+8, -3)

## Email Draft
  To: ryan@montecarlodata.com
  Subject: Security questionnaire completed
  [staged — awaiting approval]
```

**`--json`:**
```json
{
  "data": {
    "id": "...",
    "title": "PR ready for review",
    "subtitle": "3 files changed",
    "icon": "check",
    "body": [
      { "type": "heading", "level": 2, "content": "Changes" },
      { "type": "list", "items": ["Refactored OAuth callback handler", "..."] },
      { "type": "diff", "file": "src/auth/callback.ts", "additions": 45, "deletions": 12 },
      { "type": "draft_email", "provider": "gmail", "draftId": "...",
        "to": "ryan@montecarlodata.com", "subject": "Security questionnaire completed",
        "preview": "Hi Ryan, Here is the completed...",
        "actions": ["send", "edit", "discard"] }
    ],
    "link": { "type": "workspace", "workspaceId": "...", "deviceId": "..." },
    "read": false,
    "createdAt": "2026-04-03T...",
    "updatedAt": "2026-04-03T..."
  }
}
```

### `superset notifications create`
```
Input:
  --title <title>              required
  --subtitle <text>            optional
  --icon <icon>                optional, emoji or icon name
  --body-file <path>           optional, JSON block document for rich body
  --link-workspace <id>        optional
  --link-pane <paneId>         optional (requires --link-workspace)
  --link-device <deviceId>     optional
  --link-url <url>             optional
  --actions <json>             optional, JSON array of { id, label } for card-level buttons
  --push                       optional, also send OS/push notification
```

**Human output:**
```
Created notification "PR ready for review"
```

**`--json`:**
```json
{ "data": { "id": "...", "title": "PR ready for review" } }
```

### `superset notifications update <id>`
Agent updates a notification (e.g. after human feedback).
```
Input:
  <id>                         required
  --title <title>              optional
  --subtitle <text>            optional
  --body-file <path>           optional, replaces body
```

**Human output:**
```
Updated notification "PR ready for review"
```

**`--json`:**
```json
{ "data": { "id": "...", "title": "..." } }
```

### `superset notifications dismiss <id>`

**Human output:**
```
Dismissed notification
```

**`--json`:**
```json
{ "success": true }
```

### Body block types

The optional `body` field is an array of blocks:

```
heading       { type: "heading", level: 1-3, content: string }
text          { type: "text", content: string }
code          { type: "code", language: string, content: string }
list          { type: "list", ordered: boolean, items: string[] }
diff          { type: "diff", file: string, additions: number, deletions: number, patch?: string }
image         { type: "image", url: string, alt?: string }
divider       { type: "divider" }
collapsible   { type: "collapsible", title: string, blocks: Block[] }
actions       { type: "actions", items: { id: string, label: string, style?: "primary" | "danger" }[] }
checkbox      { type: "checkbox", items: { id: string, label: string, checked: boolean }[] }
```

### Staged action blocks

Notifications can embed staged actions from external providers. When a human approves in the UI, Superset executes the action via the provider's API.

```
draft_email   { type: "draft_email", provider: "gmail", draftId: string,
                to: string, subject: string, preview: string,
                actions: ["send", "edit", "discard"] }

draft_pr      { type: "draft_pr", provider: "github", repo: string,
                title: string, diff_summary: string,
                actions: ["create", "edit", "discard"] }

draft_message { type: "draft_message", provider: "slack", channel: string,
                preview: string,
                actions: ["send", "edit", "discard"] }
```

Extensible — new providers (Linear, Notion, calendar, etc.) can be added as block types.

---

## `superset organization` (cloud)

### `superset organization list`
List organizations you belong to.

**Human output:**
```
NAME          ROLE      ACTIVE
Superset      owner     ✓
Acme Corp     member
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "name": "Superset",
    "role": "owner",
    "active": true
  }]
}
```

### `superset organization switch <nameOrId>`
Switch active organization.

**Human output:**
```
Switched to Acme Corp
```

**`--json`:**
```json
{ "data": { "id": "...", "name": "Acme Corp" } }
```

---

## `superset ports` (device)

### `superset ports list`
List detected ports on a device.
```
Input:
  --device <deviceId>          optional, auto-detected
```

**Human output:**
```
PORT    URL                      WORKSPACE      TERMINAL         DETECTED
3000    http://localhost:3000     fix-auth       shell            2m ago
5173    http://localhost:5173     main           dev-server       15m ago
```

**`--json`:**
```json
{
  "data": [{
    "port": 3000,
    "url": "http://localhost:3000",
    "workspaceId": "...",
    "terminalId": "...",
    "detectedAt": "2026-04-03T..."
  }]
}
```

---

## `superset automations` (cloud + device for execution)

Gated behind a paid plan (`plan !== "free"` on the active organization).
Schedules use RRule (RFC 5545). The desktop UI exposes preset pickers;
the CLI takes the RRule directly — common shapes look like:

- Daily at 9 AM: `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`
- Weekdays at 9 AM: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0`
- Weekly on Monday at 10 AM: `FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0`
- Monthly on the 1st at 9 AM: `FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0`
- Every 15 minutes: `FREQ=MINUTELY;INTERVAL=15`

### `superset automations list`

**Human output:**
```
ID          NAME                AGENT     SCHEDULE                  ENABLED  NEXT RUN
9f3c-a201   Weekly release…     claude    every Friday at 9:00 AM   yes      2026-04-24T09:00:00-07:00
7b11-c4e0   Daily standup       claude    every day at 9:00 AM      yes      2026-04-18T09:00:00-07:00
3aa2-1fe8   Nightly test audit  codex     every day at 2:00 AM      no       —
```

**`--json`:**
```json
{
  "data": [{
    "id": "...",
    "name": "Weekly release notes",
    "agentConfig": { "id": "claude", "kind": "terminal", "label": "Claude", ... },
    "rrule": "FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0",
    "scheduleText": "every Friday at 9:00 AM",
    "timezone": "America/Los_Angeles",
    "targetHostId": "...",
    "v2ProjectId": "...",
    "v2WorkspaceId": null,
    "enabled": true,
    "nextRunAt": "2026-04-24T09:00:00-07:00"
  }]
}
```

`agentConfig` is the full snapshot of the agent preset (id, command, kind, model, etc.)
taken at create time. `v2WorkspaceId` is `null` when the automation creates a fresh
workspace per run; otherwise it points at the reused workspace.

### `superset automations create`
```
Input:
  --name <name>                required
  --rrule <rrule>              required, RFC 5545 RRULE body
  --project <projectId>        required
  --workspace <workspaceId>    optional — reuse this existing workspace every
                               run. When unset, a fresh workspace is created
                               per run inside --project.
  --prompt <text> |            one of --prompt / --prompt-file required
    --prompt-file <path>
  --device <hostId>            default: owner's online host
  --timezone <IANA>            default: host TZ, else UTC
  --dtstart <iso8601>          default: now (anchors interval rules)
  --agent <preset-id>          default: "claude"
  --agent-config-file <path>   optional — path to a JSON ResolvedAgentConfig
                               snapshot to use verbatim (bypasses --agent)
```

**Human output:**
```
Created automation "Weekly release notes" (9f3c…a201)
Next run: 2026-04-24T09:00:00-07:00
```

### `superset automations update <id>`
```
Input:
  --name <name>
  --prompt <text> | --prompt-file <path>
  --rrule <rrule>
  --timezone <IANA>
  --dtstart <iso8601>
  --agent <preset-id>
  --device <hostId>
  --enabled <bool>             pause / resume
```

### `superset automations delete <id>`

### `superset automations logs <id>`
Shows recent runs. Duration / token columns are not populated in v1 —
runs stop at "dispatched" and detailed state lives in the workspace.
```
STATUS              SCHEDULED FOR         DISPATCHED AT         KIND      ERROR
dispatched          2026-04-17T09:00:00Z  2026-04-17T09:00:01Z  chat      —
dispatched          2026-04-10T09:00:00Z  2026-04-10T09:00:02Z  chat      —
skipped_offline     2026-04-03T09:00:00Z  —                     —         target host offline
dispatch_failed     2026-03-27T09:00:00Z  —                     —         relay 502: …
```

### `superset automations run <id>`
Dispatches the automation synchronously (doesn't wait for the next cron tick)
and returns the run id. Works even on paused automations. The automation's
regular `next_run_at` is unaffected.
