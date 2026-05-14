---
name: ticket-format
description: Use when creating, drafting, or grooming a Linear or Superset ticket in this repo. Defines the canonical three-section structure.
---

# Ticket Format

## Context
2–4 sentences. What's broken or wanted, and why. Outcome-focused, not solution-focused.

## References
Where the ticket came from. Omit section if none.

| Source | Who | Link | Date |
|--------|-----|------|------|
| Slack #feedback | @alice | [thread](…) | 2026-05-10 |

## Implementation notes
Agent-groomed. Leave empty if you don't have codebase context — a later grooming pass will fill it in. When you do fill it in, use these sub-headings and skip what doesn't apply:

- `### Files` — `path:line` + why relevant
- `### Approach` — one paragraph
- `### Related code` — similar patterns in the repo
- `### Gotchas` — constraints, prior incidents
