---
name: prep-with-circleback
description: Build a brief for an upcoming meeting from Circleback — the calendar event, the history with the same people and company, open commitments on both sides, and what is still unresolved. Use when the user asks to prep for a call, "what do I need to know before", who someone is, or where things stand with a customer or partner.
argument-hint: the meeting, person, or company to prepare for
allowed-tools: mcp__circleback__SearchCalendarEvents, mcp__circleback__SearchMeetings, mcp__circleback__ReadMeetings, mcp__circleback__FindProfiles, mcp__circleback__FindCompanies, mcp__circleback__SearchActionItems, mcp__circleback__SearchEmails
---

# Brief before the meeting

A good brief is short, and every line in it comes from a source the user can
open. The job is to reconstruct where things stand with these people from
what Circleback captured, and to lead with what is unresolved.

## 1. Anchor on the event

`SearchCalendarEvents` for the window the user means (default: today and
tomorrow). Take the attendees and organizer from the event — that is the
guest list, not your guess. If the user named a person or company instead,
resolve them with `FindProfiles` or `FindCompanies` and skip the calendar.

## 2. Pull the history with these people

`SearchMeetings` filtered by the attendees' profiles or the company domain,
newest first. Read the last two or three with `ReadMeetings`. For a long
relationship read the most recent and the first: the first records what they
wanted, the most recent records what they got.

## 3. Find the open loops on both sides

The meetings you just read already carry their action items, each with a
status and an assignee. Take the open ones from there first, yours and theirs.
Reach for `SearchActionItems` (status PENDING, by assignee profile) only for
what those meetings cannot show: a standalone item, or one from a call you did
not read. An open item from the last call is the first thing the other side
will ask about. `SearchEmails` fills the gap between meetings when a thread
continued in writing.

## 4. Write the brief in that order

1. Who is coming and their role, one line each.
2. Where things stand: the last decision and the date it was made.
3. Open on our side, open on theirs, with the meeting each came from.
4. Unresolved questions the user should be ready for.

Keep it to a screen. Every line links to the meeting, event, or email thread
it came from.

## Anti-patterns

- **Summarizing every past meeting.** The brief is about what is open, not a
  history lesson.
- **Guessing roles from titles.** Take names and roles from the profile and
  the notes; say "unknown" otherwise.
- **Presenting insights as facts.** Generated insights get a "Circleback
  suggests" label or get left out.
- **Prepping for the wrong meeting.** A recurring series has one event per
  week; confirm the date before pulling history.
