---
name: file-issue
description: Turn a rough report into a Linear issue someone can pick up — reproduce the claim, check for duplicates, and fill in team, priority, and labels. Use when the user says to file, open, or create an issue, hands over a bug report or error, or asks to get something into Linear.
argument-hint: the bug, request, or error to file
allowed-tools: mcp__linear__*
---

# File an issue worth picking up

An issue is a handoff to someone who was not in this conversation. The test is whether they
can start without asking you a question.

## 1. Search before you create

Search for the error text and for the feature name separately — people describe the same bug
in words that share no vocabulary. Check closed issues too, but do not read "closed" as
"regression": most closed duplicates were closed during triage, not fixed. Call it a
regression only when the issue shows a fix that shipped, or it was reopened — then it is a
more urgent and differently-shaped report than a new bug.

Found a duplicate? Comment the new evidence on it instead of opening a second issue. Show the
user the duplicate you matched and the comment you intend to leave, and post it only once
they say to. A wrong match buries a real bug under an unrelated issue, and nobody goes
looking for what they think is already tracked.

## 2. Establish what actually happens

The report you were handed is a symptom filtered through someone's theory of the cause.
Separate the two. Write down what was observed, and mark anything you inferred as inferred.

Where you can check the claim, check it. An issue that says "search is broken" and an issue
that says "search returns no results for queries with an apostrophe, verified on staging"
have very different lifespans.

## 3. Write the body in the order it gets read

1. **What happens** — one sentence, observable, no diagnosis.
2. **Steps** — numbered, starting from a state the reader can reach.
3. **Expected vs actual** — both stated, even when the difference seems obvious.
4. **Scope** — who and how many are affected, and since when.
5. **Evidence** — the error, the log line, the request id. Attach rather than paste
   anything long.

Put the diagnosis last if you have one, marked as a guess. A confident wrong cause at the
top of an issue sends the assignee down it before they read the steps.

## 4. Route it

Resolve the team from the area the bug lives in, not from who reported it. If you cannot
tell, ask rather than guessing — a misrouted issue sits until someone triages it by hand.

Priority is about consequence, not annoyance: data loss and broken auth are urgent, a
misaligned button is not, however visible. Set an estimate only if you understand the fix
well enough to defend it; a wrong estimate is worse than none.

## 5. Show it before you create it

Print the title, body, team, priority, and labels, and ask the user to confirm. Filing is a
write to a shared backlog that other people triage and get notified about; a misrouted or
duplicate issue costs someone else's attention to undo. Reporting the result afterwards is
not confirmation — by then the write has happened.

Once they confirm, create it and report the identifier and URL along with what you set, so a
routing mistake gets corrected immediately rather than after it goes unread for a week.

## Anti-patterns

- Titles like "Bug in search" or "App broken". The title is what people scan; make it the
  one-sentence symptom.
- Pasting a whole stack trace as the body. Lead with the failure, attach the trace.
- Filing the theory instead of the symptom. When the theory is wrong the issue becomes
  unfindable by anyone hitting the actual bug.
