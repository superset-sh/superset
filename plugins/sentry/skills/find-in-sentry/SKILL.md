---
name: find-in-sentry
description: Answer "what's breaking" questions from Sentry — find the right org and project, search issues and events with the vocabulary Sentry uses, and report what is actually firing rather than the first hit. Use when the user asks what errors are happening, whether something is stable, what changed since a release, or for any health summary of a service.
argument-hint: the service, error, release, or question to look up
allowed-tools: mcp__sentry__whoami, mcp__sentry__find_organizations, mcp__sentry__find_projects, mcp__sentry__find_releases, mcp__sentry__search_issues, mcp__sentry__search_events, mcp__sentry__get_issue_details
---

# Find what is actually firing

Sentry answers precise questions precisely and vague questions misleadingly.
The work is scoping the question before searching, and ranking what comes back
by impact instead of by relevance.

## 1. Scope to the right project first

Run `find_organizations` and `find_projects` before searching if you are not
certain where the code reports to. A monorepo often maps to several Sentry
projects (api, web, desktop), and a search in the wrong one returns a
confident, empty answer. Say which project you searched.

## 2. Search the way Sentry indexes, not the way people ask

"Is checkout broken?" becomes queries on what Sentry actually stores: the
error type, the transaction or URL, the release. Prefer `search_issues` for
"what problems exist" and `search_events` for "how often / for whom / since
when". Run two or three narrow queries over one broad one, and time-bound
them — `is:unresolved` over the last 24h answers a different question than
all-time.

## 3. Rank by impact, not by recency of the search result

The issues worth reporting are the ones with high event counts, many affected
users, or a first-seen that matches a recent release. A brand-new issue with
three events can matter more than a year-old one with thousands — say why the
ones you picked matter. When a number is load-bearing (error rate, affected
users), take it from `search_events` rather than eyeballing the issue list.

## 4. Answer with links and the time window

Every issue you cite gets its Sentry link and the window you looked at.
"No matching issues in the last 7 days in `api`" is a complete, useful
answer — silence about scope is how "it's fine" turns out to mean "I searched
the wrong project".

## Anti-patterns

- **Reporting the first page as the truth.** Sort order is not severity.
- **Mixing environments.** Production noise and staging noise answer different
  questions; filter to the environment the user cares about.
- **Counting issues to measure health.** Ten one-off issues can be healthier
  than one issue hitting every user; lead with events and users affected.
- **Answering "is it stable" without a baseline.** Compare against the prior
  window or the prior release, not against zero.
