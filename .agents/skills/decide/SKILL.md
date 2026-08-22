---
name: decide
description: Walk the user through design or implementation decisions one at a time, or review completed code one change at a time. Use when the user says "walk me through each decision", "let's decide together", "help me work through these choices", "walk me through what you did", or "QA step by step". Present concise context, mutually exclusive options, log each answer, and finish with a summary.
---

# Decide

## Prepare

Before a design walkthrough, inspect the relevant code and record concrete bugs, inconsistencies, and decision points in `plans/<YYYYMMDD>-<topic>.md` or the appropriate app-scoped `plans/` directory. Preserve existing edits; never discard speculative or user-authored work without explicit approval.

Order decisions by dependency and leverage, not document order.

## Decision walkthrough

For each decision:

1. Show `## Decision N: <title>`.
2. Give two to four sentences of context grounded in real files or functions.
3. State the trade-off in one sentence.
4. Ask exactly one interactive question with two to four mutually exclusive options.
   - Use `ask_user` when available. In Codex Plan mode, use `request_user_input` when that is the exposed interactive question tool.
   - Never substitute a plain-text question when repository instructions require an interactive overlay.
   - Keep labels to five words or fewer.
   - Put the recommendation first and suffix its label with `(Recommended)`.
   - Explain each option and its trade-off in one sentence.
   - Do not add an `Other` option when the client adds one automatically.
5. After the answer, write `Logged: <decision>.` and continue.

If the user acknowledges an issue without choosing, log the recommended choice and say they can correct the assumption.

At the end, provide a `| # | Decision | Choice |` table and offer to turn the audit into an implementation plan. Do not write implementation code during the decision walkthrough.

## QA walkthrough

Use this mode when the user wants to review existing code step by step.

1. Identify the review unit: a commit, staged diff, PR, or explicit file set.
2. Break it into logical steps in dependency order.
3. Show one step per turn with:
   - `## Step N: <title>`
   - One or two sentences explaining what changed and why
   - A focused real-code excerpt with file and line references
   - One interactive verdict question: `Looks good, next step (Recommended)`, `Push back, change this`, and, only for non-trivial code, `Pause, explain more`
4. Wait for the verdict before showing the next step.
5. Log approvals, collect requested changes, and finish with a `| # | Step | Verdict |` table.

If a step reveals a genuine design fork, pause the QA walkthrough and offer to switch to decision mode for that fork.
