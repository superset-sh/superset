---
name: schedule-with-superhuman
description: Find a time and put a meeting on the calendar through Superhuman — read what is already booked, check the participants' availability, propose slots, and create the event only once the user picks one. Use when the user asks what is on their calendar, when they are free, to find a time with someone, or to schedule, move, or set up a call.
argument-hint: who to meet, for how long, and the window to look in
allowed-tools: mcp__superhuman__list_accounts, mcp__superhuman__query_email_and_calendar, mcp__superhuman__get_availability, mcp__superhuman__create_or_update_event, mcp__superhuman__list_threads, mcp__superhuman__get_thread
---

# Propose, then book

An invite reaches every attendee the moment the event is created, so the order
is fixed: know the user's calendar, find slots, show them, and create the event
only once a slot is chosen.

## 1. Read the calendar through the question tool

`query_email_and_calendar` answers "what is on my calendar Thursday", "when is
my next call with Acme", and "am I free Friday afternoon". It reads mail and
calendar together, so it also finds the thread where a meeting was proposed.
The account matters: `list_accounts` first, and ask with `acting_email` when
the meeting belongs to an inbox other than the primary one.

## 2. Find slots, in the right time zone

`get_availability` takes participant emails, a window, and a duration, and
returns free slots. Pass `timezone` when the user named one or the participants
span zones, and write the window as RFC3339 with an offset, because a bare date
is a guess. It keeps to 9 to 5 in the user's zone by default; set
`working_hours_only: false` when the user asked for evenings or another zone's
hours.

Offer two or three slots with the day, time, and zone written out, and stop.

## 3. Create the event once a slot is chosen

`create_or_update_event` needs `title`, `start`, `end`, and `timezone`. Add
`attendees` for the people to invite, `conference: true` for a video link, a
`description` with context from the thread, and `location` for anything in
person. Attendees go on the event only when the user asked to invite them,
because the invite goes out on creation. Pass `event_id` to move or edit an
event. A recurrence can only be set when the event is created, and editing a
recurring event changes its first occurrence only. A new event takes up to a
minute to show up in queries, so do not re-query to confirm it.

Report the event as created: title, time with zone, attendees, and whether a
conference link was added.

## Anti-patterns

- **Creating the event to show the user the options.** Proposals are text; the
  event is the booking.
- **Assuming the user's time zone for someone else.** Name the zone in every
  slot.
- **Inviting the whole thread.** Attendees are the people the user named.
- **Booking outside the window the user gave.** Widen the search only when the
  user agrees there was nothing inside it.
