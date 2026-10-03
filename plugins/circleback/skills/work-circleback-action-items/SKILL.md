---
name: work-circleback-action-items
description: Work the action items Circleback captured — find what is assigned to this user, do the ones the workspace can do, and update status only for work that is actually finished. Use when the user asks what they owe, "do my action items", "what's still open from", or wants to close, reassign, or add an action item.
argument-hint: which meeting, person, or time range to work through, or the action item to change
allowed-tools: mcp__circleback__SearchActionItems, mcp__circleback__ReadMeetings, mcp__circleback__FindProfiles, mcp__circleback__CreateActionItem, mcp__circleback__UpdateActionItem, mcp__circleback__SearchMeetings
---

# Work the action items

Circleback turns meetings into action items with an owner and a status. The
job is to work the ones that belong to this user, and to keep the list true:
an item is done when the work is done, not when it is convenient.

## 1. Start from the assignee, not the search box

`SearchActionItems` with status PENDING returns the user's own open items.
For someone else's, resolve them with `FindProfiles` and pass their profile
ID. Filter by date range or tags when the user scopes the request ("from this
week's customer calls"), and read the linked meeting with `ReadMeetings` when
an item's title does not say enough to act on.

## 2. Sort each item by what the workspace can do

- **A code change** — make it here, open it for review, and cite the meeting.
- **A ticket or issue** — file it through the connected tracker with the
  item's wording and the meeting in the body.
- **A message or reply** — draft it; never send unless the user asked for
  exactly that.
- **Something outside the workspace** — leave it open and say so.

## 3. Update status only for finished work

`UpdateActionItem` to DONE after the change is merged, the ticket exists, or
the user confirms they did the part you could not. Reassign only when the
notes make the real owner clear or the user asks. `CreateActionItem` only when
the user asks for a new one; a follow-up you discovered goes in your report
first.

## 4. Report the list

One line per item: what it was, what you did (changed, filed, drafted, left
open and why), and the meeting it came from. Items that turned out stale —
done in a later meeting, or superseded — are worth pointing out rather than
quietly closing.

## Anti-patterns

- **Marking done to clean up the list.** A closed item that was not finished
  resurfaces as a broken promise.
- **Deleting instead of closing.** Deletion erases the record; it is only for
  an item the user says should never have existed.
- **Doing other people's items.** Work assigned to a teammate is theirs to
  close; list it, do not take it.
- **Acting on the title alone.** The linked meeting says what "fix the
  export" actually meant.
