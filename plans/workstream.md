# Workstream UX Design

## Core Mental Model

A workstream is a **pipeline** with items flowing left-to-right through stages. The user's mental model is:

```
Things to do → Things being worked on → Things shipped
```

That maps cleanly to a **board layout** (like Linear/Trello), but the middle column ("being worked on") is where Superset is fundamentally different — it's not just a status label, it's a **live environment** with an agent running.

---

## Layout: Hybrid Board + Activity Feed

Split the page into **two zones**:

### Top: Live Workspaces (the "war room")

This is the differentiated piece. A horizontal row of **workspace cards** showing what's actively running right now — think of it like GitHub Actions' active runs or a CI dashboard. Each card shows:

- **Task title** + source icon (Linear/GH/Jira)
- **Agent status** — spinner if running, idle, waiting for input
- **User avatar** — who owns this workspace
- **Live indicator** — green dot / pulse animation for active sessions
- **Quick stats** — files changed, time running, branch name
- **PR status badge** — if a PR has been opened from this workspace

This section should feel **alive** — real-time updates, subtle animations. It answers the question "what's happening right now?" at a glance. Think of it like Linear's "Active" cycle view crossed with Vercel's deployment dashboard.

When empty, this area collapses or shows a CTA: "Pick a task from the backlog to start a workspace."

### Bottom: The Board (backlog + history)

A standard **kanban board** with columns, but opinionated:

| Backlog | In Progress | In Review | Done |
|---------|-------------|-----------|------|
| Sourced from Linear/GH/Jira | Has a workspace | PR opened | Merged/Closed |

Key details:

- **Backlog** — grouped by source (Linear section, GitHub section, etc.) or unified with source icons. Each card has a prominent **"Start Workspace"** button/action on hover
- **In Progress** — these cards link to/mirror the live workspace cards above. They show the same agent activity but in a compact card form within the board context
- **In Review** — task has produced a PR. Show PR number, review status, CI checks
- **Done** — merged/closed. Faded or collapsible

---

## Why This Split Works

1. **The top zone answers "what's happening now?"** — it's the real-time dashboard. Managers/teammates glance here to see activity. It's the thing that makes Superset feel alive vs. a static board.

2. **The bottom zone answers "what's the state of all work?"** — it's the organizational layer. It's familiar (everyone knows kanban). It gives you the full picture across the lifecycle.

3. **The action of "start workspace" bridges the two** — dragging/clicking a backlog item promotes it to the live zone. That's the core interaction loop.

---

## Alternative Views

### List View (Linear-style toggle)

Some people prefer a dense table:

```
Title          Source    Status        Workspace    Agent    PR       Assignee
Fix auth bug   Linear    In Progress   ● Running    Claude   #482     @avi
Add search     GitHub    Backlog       —            —        —        —
Refactor DB    Jira      In Review     ● Idle       —        #491     @dan
```

More information-dense and better for power users with lots of tasks.

### Grouped by Person

If the org-level view is important, a toggle that groups by team member:

```
@avi (2 active)
  ├── Fix auth bug      ● Agent running    PR #482 (2 approvals)
  └── Add caching       ● Agent idle

@dan (1 active)
  └── Refactor DB       ● In review        PR #491 (CI failing)
```

Answers "who's doing what?" directly.

---

## Visual Inspiration Map

| Concept | Steal from |
|---|---|
| Board columns + lifecycle | Linear's cycle view |
| Live workspace cards | Vercel deployments dashboard |
| Agent activity/status | GitHub Actions run view |
| Source integration icons | Linear's integration badges |
| Real-time presence | Figma's avatar cursors / Linear's "viewing" indicators |
| Dense list view | Linear's list layout |
| "Start workspace" action | Railway's "Deploy" button UX |

---

## The Key UX Insight

The thing that makes this feel intuitive vs. "yet another board" is **treating workspaces as first-class living objects, not just a status**. The workspace card should feel like peeking into a terminal — maybe a mini-preview of recent agent output, or a file-change diff count ticking up. That "aliveness" is what makes the workstream concept click for users.

The backlog is table stakes. The live workspace layer on top is what makes it a *workstream* and not just a *task board*.
