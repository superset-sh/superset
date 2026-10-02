---
name: debug-with-sentry
description: Root-cause a production error with Sentry's evidence before touching code — pull the issue, read the stack trace and breadcrumbs, and separate the crash from its trigger. Use when the user pastes a Sentry link or issue ID, reports a production error, or asks why something is crashing for users.
argument-hint: the Sentry issue URL, short ID, or a description of the error
allowed-tools: mcp__sentry__get_issue_details, mcp__sentry__get_event_stacktrace, mcp__sentry__get_issue_breadcrumbs, mcp__sentry__get_issue_tag_values, mcp__sentry__search_issues, mcp__sentry__search_events, mcp__sentry__find_releases, mcp__sentry__analyze_issue_with_seer, mcp__sentry__update_issue
---

# Root-cause with the evidence, not the guess

A Sentry issue is a claim about what broke. The job is to turn it into a claim
about *why* it broke, backed by the event data, before anyone edits code.

## 1. Get the real issue, not the search hit

A pasted URL or short ID (`PROJECT-123`) goes straight to `get_issue_details`.
A described error ("users can't check out") goes through `search_issues` first,
but treat the results as candidates: match on the error type and the affected
code path, not on title similarity. If two issues share a message but differ in
stack trace, they are two bugs.

## 2. Read the stack trace like a diff

Fetch the newest event's stack trace. The top frame is where it *crashed*, not
where it *broke* — walk down until you leave library code and hit the first
frame owned by this repo. That frame and its local variables are the starting
point. Cross-check the file against the working tree: production runs a
release, and the line numbers may belong to code that has since changed.
`find_releases` tells you which version the events come from.

## 3. Use the distribution before the theory

Before proposing a cause, check what the events have in common:

- **Tags** (`get_issue_tag_values`): one browser, one endpoint, one tenant, one
  release? A bug scoped to a dimension names its own trigger.
- **Breadcrumbs**: what the user did right before. A crash after a retry storm
  is a different bug than the same crash on first click.
- **First seen / volume**: an issue that started with a release points at that
  release's diff. One that grew slowly points at data or traffic.

Seer (`analyze_issue_with_seer`) is worth running for a second opinion, but
verify its suggested cause against the frames yourself before repeating it.

## 4. Report cause, scope, and blast radius

The finding is three sentences: what fails, why, and who it hits (volume,
affected users, releases). Link the issue. If the user asks for a fix, fix the
frame you identified — and only then consider `update_issue` to assign or
resolve, never as a way to make the dashboard quiet.

## Anti-patterns

- **Fixing the top frame.** The top frame is often a library that faithfully
  threw on bad input from three frames below.
- **Trusting the issue title.** Sentry titles are the exception message; two
  different bugs can share one, and grouping is heuristic.
- **Reading one event.** One event is an anecdote; the tag distribution is the
  evidence.
- **Resolving without a shipped fix.** A resolved issue that regresses comes
  back as a new-looking issue and erases its history.
