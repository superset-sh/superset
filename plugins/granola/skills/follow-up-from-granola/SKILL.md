---
name: follow-up-from-granola
description: Turn a meeting into work — read its Granola notes, extract the commitments that belong to this user, and carry each one out or draft it (a code change, a ticket, a reply) with a trace back to the note. Use when the user says "do the follow-ups from", "implement what we agreed", "make tickets from", or points at a meeting after a sync, planning session, or customer call.
argument-hint: the meeting (title, date, or ID) to act on, and optionally which kind of follow-up
allowed-tools: mcp__granola__*
---

# Turn the meeting into work

A meeting produces commitments, and most of them evaporate because nobody
turned them into tasks. The job is to read the notes, find the commitments
that are this user's to act on, and take each one as far as the workspace
allows — without inventing work the meeting did not ask for.

## 1. Read the whole meeting before extracting anything

Fetch the meeting with `get_meetings`. If the user gave a title or a date,
find it with `list_meetings` first and confirm it is the right instance — a
recurring meeting has many. Read the notes end to end: action items sit in a
section, but commitments also hide in the discussion ("I'll take a look at
that", "we should ship that first").

## 2. Extract commitments, and attribute each one

For each commitment record what, who owns it, by when, and the sentence in the
notes it comes from. Keep only what the notes support. When ownership is
unclear, check `get_meeting_transcript` for who actually said it; if it is
still unclear, list it as unassigned rather than handing it to the user.

## 3. Sort by what the workspace can do

- **A code change the user owns** — make it in the workspace and open it for
  review, citing the meeting.
- **A ticket or issue** — file it through whichever tracker plugin is
  connected, with the note's wording and the meeting in the body.
- **A message or reply** — draft it. Never send on the user's behalf unless
  they asked for exactly that.
- **Someone else's item** — list it under "not yours" so the user can nudge
  them; do not act on it.

Ask before acting only when a commitment is ambiguous or expensive. A clear
"fix the flaky test" in the notes does not need a second confirmation.

## 4. Report with the trace

Finish with one line per commitment: what you did with it (changed, filed,
drafted, skipped and why) and the meeting and line it came from. The user
should be able to check every item against the notes.

## Anti-patterns

- **Doing the generated "next steps" verbatim.** Summaries guess at action
  items; verify each against the discussion before treating it as a
  commitment.
- **Turning every mention into a task.** "Someone should look at that
  eventually" is not a commitment; a name and a timeframe are.
- **Acting on other people's items.** A meeting assigns work to many people;
  the user asked for their follow-ups.
- **Losing the trace.** A ticket that does not say which meeting asked for it
  gets re-litigated at the next one.
