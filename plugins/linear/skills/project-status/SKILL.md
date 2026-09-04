---
name: project-status
description: Draft a Linear project status update from what actually moved — progress, risks, and the one decision that needs making. Use when someone asks for a project update, a status post, where a project stands, whether it will land on time, or what to tell stakeholders.
argument-hint: project name or URL
allowed-tools: mcp__linear__*
---

# Draft a project status update

A status update is read by people who will not open a single issue. It has to survive being
the only thing they read: **is this landing, what changed, and what do you need from them.**

## 1. Read the movement, not the snapshot

Percent-complete is the number people reach for and the one that lies. A project can sit at
70% for a month while the last three issues get harder. What tells the story is what moved
since the previous update: issues completed, issues added, and target dates that shifted.

Fetch the project's issues plus its previous status update. Without the previous one you are
writing a summary, not an update, and the reader cannot tell what is new.

## 2. Judge the trajectory honestly

Pick one and commit to it. Hedging every sentence is how a project stays green until the
week it ships late.

| Call | What justifies it |
| --- | --- |
| **On track** | Remaining scope fits the remaining time at the current rate |
| **At risk** | A dependency, an unknown, or a rate that has to improve to land |
| **Off track** | The date will move, or scope has to be cut — say which |

If you cannot tell, the answer is at risk, and the reason is that nobody can tell.

## 3. Name risks as things that could happen

"Backend integration is risky" gives the reader nothing. "The export endpoint is not built,
we cannot finish import until it is, and the owner is on the payments migration until the
14th" tells them what to move. A risk is a specific event with a specific consequence and
usually a specific person who can prevent it.

Include scope that was added mid-project. Silently absorbed scope is why the date moves,
and it is invisible unless the update names it.

## 4. Ask for what you need

Most updates end with nothing to do, so nothing is done. If a decision, a person, or a
descope would help, state it as the last line with a name and a date attached. One ask is
better than three, because three get triaged and one gets answered.

## 5. Show the draft, then post it

Print the draft in full and stop. This skill drafts; publishing is the user's call. A status
update is read by stakeholders and enters the project's permanent history, and a wrong
trajectory or a risk named for the wrong person is not something a follow-up correction
undoes — so an unreviewed post is worse than a late one.

Once they approve it, write it on the project so it lives next to the work rather than in a
chat message that is gone by the next morning. Keep it to a few short paragraphs: trajectory,
what moved, risks, the ask. If they asked only for a draft, stop after printing it.

## Anti-patterns

- Listing every completed issue. That is the changelog, not the update.
- "No blockers" when the real answer is that nobody has looked. Say you have not looked.
- Copying the previous update with the numbers changed. The reader learns to skip it, and
  the one update that matters gets skipped too.
