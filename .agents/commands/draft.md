---
description: Research the codebase, draft a Linear ticket, and create it ONLY after the user explicitly accepts
---

Draft a Linear ticket for the headache, problem, or feature request in `$ARGUMENTS`. Research the codebase to flesh out context, present the draft, and wait for the user to **accept**, **edit**, or **discard** it. Only create the Linear ticket after explicit acceptance.

## Steps

### 1. Understand the request

Read `$ARGUMENTS`. Identify whether this is:
- A **bug / headache** (something is broken or behaves unexpectedly)
- A **feature request** (something new is wanted)
- A **chore / refactor** (cleanup, debt, or restructuring)

If the request is genuinely ambiguous or missing critical info (e.g., "the dashboard is broken" with no detail), ask one clarifying question via `ask_user` before researching. Otherwise proceed.

### 2. Research the codebase

Use Glob, Grep, Read, and the Explore agent to gather enough context to flesh out the ticket. Aim to answer:

- **For bugs:** Where does the suspect code live? What's the likely root cause? Are there related prior incidents (git log, comments)?
- **For features:** Where would this slot into the existing architecture? What files/modules are affected? Are there similar patterns already in the repo to follow?
- **For chores:** What is the current state? What's the scope (which files/packages)?

Prefer the Explore agent for broad investigation (>3 queries). Use direct tools when the target is known.

### 3. Draft the ticket

Produce two things: a **Title** (Linear's title field) and a **Description** (Linear's description field, markdown).

**Title** — one short imperative line, under 80 chars. Prefix with type: `Fix:`, `Feat:`, `Chore:`, or `Refactor:`. No trailing period.

**Description** — markdown body following the canonical structure in `.agents/skills/ticket-format/SKILL.md`. Use these H2 sections in this order, and skip any that don't apply:

- `## Context` — 2–4 sentences. What's broken or wanted, and why. Outcome-focused, not solution-focused. Always include.
- `## References` — only if the user provided a source (Slack thread, PR, incident). Use the table from the ticket-format skill. Otherwise omit entirely.
- `## Implementation notes` — agent-groomed from your research. Use these H3 sub-headings, in this order, skipping any that don't apply:
  - `### Files` — bulleted list of `path:line` + one-line reason
  - `### Approach` — one paragraph
  - `### Related code` — similar patterns in the repo
  - `### Gotchas` — constraints, prior incidents, edge cases

### 4. Present the draft

Output the title on its own line, then the description body inside a fenced ```` ```markdown ```` block so the user can read it the way it would appear in Linear. Format:

````
**Title:** <title>

**Description:**

```markdown
## Context
…

## Implementation notes

### Files
- `path:line` — why

### Approach
…
```
````

Make it explicit that nothing has been created yet.

### 5. Ask the user to review

Immediately after presenting the draft, call `ask_user` with the question "How should I handle this draft?" and the following options:

- **Accept** — create the Linear ticket as-is
- **Edit** — user will reply with changes; revise and re-present, then ask again
- **Discard** — drop the draft, no ticket created

Loop on **Edit**: apply the user's requested changes to the title and/or description, re-present the full updated draft inside the same fenced format from step 4, and call `ask_user` again with the same three options. Keep looping until the user picks **Accept** or **Discard**.

On **Discard**, confirm in one short sentence that nothing was created, and stop.

### 6. Create the Linear ticket (only after Accept)

After — and only after — the user picks **Accept**:

1. Resolve the team. Call `mcp__linear-server__list_teams`. If exactly one team is returned, use it. If multiple teams exist, call `ask_user` with the team names as options and use the chosen team's id.
2. Call `mcp__linear-server__save_issue` with:
   - `team`: the resolved team id
   - `title`: the accepted title (without the `**Title:**` prefix)
   - `description`: the accepted markdown description body (the contents of the fenced block, not the fence itself; use real newlines, not literal `\n`)
3. After it succeeds, report the new issue's identifier (e.g. `ENG-123`) and URL in one line. Do not set assignee, labels, status, project, or cycle unless the user asked for it during the review loop.

## Rules

- **No silent writes.** Never call `mcp__linear-server__save_issue` or any other Linear write tool until the user has explicitly chosen **Accept** in step 5.
- **No extra mutations.** Don't assign, label, set status, add to a project, or otherwise mutate Linear state beyond creating the issue with the accepted title and description.
- Read-only Linear lookups (`list_teams`, optionally `list_issues` for duplicate check) are fine, but skip them unless directly useful.
- Don't guess at file paths — verify with Glob/Grep/Read before citing them in the draft.
- Keep the draft tight. Don't pad sections with speculation; if you don't know, leave the sub-heading out.

$ARGUMENTS
