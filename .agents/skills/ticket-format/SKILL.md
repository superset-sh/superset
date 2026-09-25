---
name: ticket-format
description: Canonical three-section structure for Linear and Superset tickets in this repo. Use when creating, drafting, or grooming a ticket.
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
Agent-groomed. Leave empty if you don't have codebase context; a later grooming pass will fill it in. When you do fill it in, use these sub-headings and skip what doesn't apply:

- `### Files`: `path:line` + why relevant
- `### Approach`: one paragraph
- `### Related code`: similar patterns in the repo
- `### Gotchas`: constraints, prior incidents
