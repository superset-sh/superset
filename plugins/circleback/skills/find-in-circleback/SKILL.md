---
name: find-in-circleback
description: Answer "what did we say, decide, or promise" from Circleback meetings — search by attendee, company, tag, or date before keyword, read the notes before the transcript, and cite the meeting behind every claim. Use when the user asks what happened on a call, what a customer or teammate said, what was agreed, or refers to a meeting, sync, demo, or interview.
argument-hint: the meeting, person, company, topic, or question to look up
allowed-tools: mcp__circleback__SearchMeetings, mcp__circleback__ReadMeetings, mcp__circleback__SearchTranscripts, mcp__circleback__GetTranscriptsForMeetings, mcp__circleback__FindProfiles, mcp__circleback__FindCompanies, mcp__circleback__ListTags, mcp__circleback__SearchCalendarEvents
---

# Find what was actually said

Circleback keeps notes, action items, insights, and a transcript for every
captured meeting. The job is to find the right meeting, read what it records,
and separate what was decided from what was discussed.

## 1. Filter by who and when before what

`SearchMeetings` matches keywords against titles and notes, and titles rarely
contain the topic. Resolve people with `FindProfiles` and companies with
`FindCompanies`, then search with `profiles` or `domains` and the date range
the user gave you. Do not invent a date range to narrow results — if the user
said "recently", say which window you used. Tags (`ListTags`) find a recurring
series. Keep the `intent` argument honest: it is the user's question, and it
shapes which excerpts the tool returns.

## 2. Notes first, transcript when the wording matters

`ReadMeetings` (up to 50 IDs at once) returns notes, attendees, action items,
and insights — enough for "what was decided". Use `SearchTranscripts` to find
where a phrase was said across meetings, and `GetTranscriptsForMeetings` when
the exact words matter: a commitment, a number, a quote the user wants
verbatim. Quote the line; never present a paraphrase as a quote.

## 3. Separate decided from discussed

An "agreed" line is a decision. An action item is a recorded follow-up, not
proof that anyone agreed to what it follows from; call it a decision only when
the notes or transcript show the agreement. A topic in the notes with no owner
and no outcome was discussed, not decided; say so. Two meetings that disagree
are a finding to report, not something to reconcile silently — the later one
is not automatically right.

## 4. Cite the meeting

Every claim names the meeting and its date. For anything the user may act on
— a promise to a customer, a deadline — also say who said it. When nothing
matches, state the filters you searched (people, domain, dates, tags) so an
empty answer can be checked. A meeting that was never captured leaves only a
calendar event, which `SearchCalendarEvents` can confirm.

## Anti-patterns

- **Keyword search first.** Most meetings are found by attendee and date;
  keywords narrow, they do not locate.
- **Treating AI insights as the record.** Insights are generated; the notes and
  the transcript are what happened.
- **Reading one instance of a recurring meeting.** A weekly call decides
  things across weeks; check the neighbours before saying it never came up.
- **Paging blindly.** Fetch the next page only when the last one was full and
  the question is still open.
