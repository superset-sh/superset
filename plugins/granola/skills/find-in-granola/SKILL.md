---
name: find-in-granola
description: Answer "what did we say, decide, or promise" from Granola meeting notes — narrow to the meetings that can hold the answer, read the notes before the transcript, and cite the meeting behind every claim. Use when the user asks what happened in a meeting, what a customer or teammate said, what was decided or promised, or refers to a call, sync, standup, or demo.
argument-hint: the meeting, person, topic, or question to look up
allowed-tools: mcp__granola__*
---

# Find what was actually said

Meeting notes are what people remembered, plus a summary a model wrote
afterwards. The job is to locate the right meeting, read what it records, and
separate what was decided from what was merely discussed.

## 1. Narrow to the meetings that can contain the answer

Start from `list_meetings` scoped by time range and involvement, not from a
broad query. "The customer call last week" is a date range and an attendee,
not a keyword. If the user names a folder or team space, `list_meeting_folders`
first and list inside it. When results look empty, `get_account_info` tells you
which email and workspace you are reading from — a personal account connected
where the work one was meant is the usual cause, so say which one you searched.

## 2. Notes first, transcript only when the wording matters

`get_meetings` returns the summarized notes and any private notes, which is
enough for "what was decided". Reach for `get_meeting_transcript` only when the
exact phrasing matters — a commitment, a number, a quote the user wants
verbatim — and quote the line rather than paraphrasing it. Transcripts are
long; read them for the passage you need, not front to back.

## 3. Ask the question tool questions, not lookups

`query_granola_meetings` answers a natural-language question across many
meetings and cites its sources. Use it when the question spans meetings ("what
have customers said about pricing this quarter"). Do not use it to fetch a
meeting you already identified — read that one directly, because a synthesized
answer blurs which meeting said what.

## 4. Separate decided from discussed

Notes mix proposals, objections, and outcomes. Report a decision only when the
notes record one — an action item, an "agreed", an owner and a date. If the
notes show discussion without a conclusion, say the question was raised and
not resolved; that is a real answer.

## 5. Cite the meeting

Every claim names the meeting title and date it came from, with a link when
the tool returns one. Two meetings that disagree are a finding to report, not
a conflict to resolve silently — the later one is not automatically right.

## Anti-patterns

- **Searching by keyword when the user gave you a date or a person.** Meeting
  titles rarely contain the topic; attendees and dates find the meeting.
- **Quoting the summary as if someone said it.** Summaries are generated; only
  the transcript holds words people actually spoke.
- **Reading one instance of a recurring meeting.** A weekly sync decides things
  across weeks; check the neighbours before saying something was never raised.
- **Reporting "no meetings found" without the scope.** Name the workspace,
  folder, and time range you searched, so an empty result can be checked.
