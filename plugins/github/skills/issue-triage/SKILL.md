---
name: issue-triage
description: Triage a GitHub issue into something actionable — reproduce the claim, find duplicates, judge severity, and apply labels, milestone, and assignee. Use when the user asks to triage an issue, sort the backlog, deal with new issues, check whether a bug is already reported, or says "what should we do with this issue".
argument-hint: issue URL or number, or a repo to sweep
allowed-tools: mcp__github__*
---

# Triage a GitHub issue

Triage answers three questions in order: **is it real, is it new, and how urgent is it.**
Labels and assignees come last. Applying labels without answering the first three is
filing, not triage.

## 1. Read it as written

Fetch the issue and its comments. Separate what the reporter **observed** from what they
**concluded**. "The API returns 500 when I pass an empty array" is an observation.
"The validation layer is broken" is a conclusion, and it is frequently wrong even when the
observation is right. Triage the observation.

Note what is missing: version, environment, reproduction steps, actual vs expected. You
need these to judge severity, but ask for them only after step 2 — most issues that look
under-specified turn out to be duplicates of a well-specified one.

## 2. Search for duplicates before anything else

This is the step that gets skipped and the one that saves the most work.

Search the issue's distinctive terms — an error string, a function name, a status code —
rather than its title. Titles describe symptoms in the reporter's words; error text is
stable across reporters. Search **closed** issues too: a bug closed as fixed and reported
again means a regression, which is a different and more urgent finding than a new bug.

When you find a duplicate, comment linking both directions and close the newer one, unless
the newer report contains a better reproduction — in which case close the older and carry
the good repro forward.

## 3. Reproduce, or say plainly that you did not

If the repo is checked out and the issue has steps, run them. Record the result in a
comment: what you ran, what happened, on what version.

If you cannot reproduce, say which specific step failed and what you saw instead. Never
label something `cannot-reproduce` on the strength of not having tried — an unreproduced
bug that gets closed and refiled three times costs more than the ten minutes of trying.

## 4. Judge severity on impact, not volume

Ask what the user cannot do, and how many users are in that position.

- **Critical** — data loss, security exposure, or the primary flow is broken with no
  workaround.
- **High** — a common flow is broken but has a workaround, or a rare flow is fully broken.
- **Normal** — a real defect with limited reach.
- **Low** — cosmetic, or a defect behind a flag nobody has on.

A loud thread is not evidence of severity. Ten reports of a cosmetic issue is still
cosmetic; one report of silent data corruption is critical.

## 5. Label, assign, milestone

Apply the repo's existing labels — read them first rather than inventing new ones. Every
issue gets a type (`bug`, `feature`, `docs`) and a severity. Add an area label only if the
repo uses them and you are confident which area owns it; a wrong area label routes the
issue to people who will ignore it, which is worse than no label.

Assign only when you can name the person by their ownership of the code, not by who last
touched the file. Otherwise leave it unassigned and let the owning team pick it up.

## Anti-patterns

- Closing as `works-as-intended` without quoting the documentation or code that intends it.
- Asking for a reproduction when the issue already has one that you did not run.
- Labeling `good-first-issue` for anything you have not confirmed is small — that label is
  a promise to a newcomer, and breaking it costs a contributor.
- Bulk-relabeling a backlog in one pass. Triage is per-issue judgment; a sweep that touches
  fifty issues in a minute did not judge any of them.
