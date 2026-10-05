---
name: triage-superhuman-inbox
description: Work through a Superhuman inbox — sort what is there into needs a reply, waiting on someone else, worth knowing, and noise, then archive, star, label, remind, or unsubscribe only as the user directs. Use when the user asks what needs their attention, what they are waiting on, to triage or clean up their inbox, or to deal with newsletters and notifications.
argument-hint: which account, split, or time range to triage, and what to do with each group
allowed-tools: mcp__superhuman__list_accounts, mcp__superhuman__list_splits, mcp__superhuman__list_labels, mcp__superhuman__list_threads, mcp__superhuman__get_thread, mcp__superhuman__query_email_and_calendar, mcp__superhuman__update_thread, mcp__superhuman__list_reminders, mcp__superhuman__create_or_update_reminder, mcp__superhuman__discard_reminder, mcp__superhuman__unsubscribe
---

# Sort first, act second

Triage is a reading job with a short list of actions at the end. Read enough of
each thread to know what it asks of the user, group the inbox by what happens
next, and change the mailbox only where the user said to.

## 1. Scope the sweep

`list_accounts` first. When the user named an account, or more than one is
linked, every call that follows carries that account's `acting_email`, reads
and changes alike: a call without it acts on the default account, so a sweep of
the wrong mailbox looks exactly like a successful sweep. Then `list_splits`:
splits carry thread and unread counts, so you can say "Important has 14 unread,
Other has 212" before reading anything. Triage the splits the user cares about
(Important, VIP, Team, a support split) one at a time with `list_threads`, and
leave Other and the notification splits for a cleanup pass the user asks for.
`is_unread` narrows a split, but `split` ignores the date filters and `sort`
only orders the returned page, so a time window is yours to enforce: page with
`cursor` and compare each thread's timestamp against the window. An older
thread on a page does not end the sweep; later pages can still hold threads
inside it.

## 2. Read enough to classify

The listing's snippet is the latest message, which is often the user's own
reply. Open threads where the ask is unclear with `get_thread` and read the last
exchange. Sort each thread into one of four groups:

- **Needs a reply from the user**: a question or request addressed to them,
  with no answer from them after it.
- **Waiting on someone else**: the user wrote last, or asked for something that
  has not come back.
- **Worth knowing**: FYI, decisions made elsewhere, receipts.
- **Noise**: newsletters, automated notifications, cold outreach.

Participants and dates decide the group, not the sender's name or the subject
line. A thread where the user replied last is waiting only when that reply
asked for something; a closing thanks, or an answer that settled the question,
is done, however urgent the subject reads.

## 3. Report before changing anything

One line per thread in the first two groups: who, what they want, how old, and
the link `https://mail.superhuman.com/<account email>/thread/<thread id>`.
Oldest first in "needs a reply", because that is the order the user is behind
in. Summarize the other two groups by count and sender. Then stop, unless the
user already said what to do with each group.

## 4. Act only as directed, and against the thread's last message

`update_thread` archives (`mark_done`), stars, marks read, moves a thread
between Important and Other, and adds or removes labels. It needs the thread's
`last_message_id` from `get_thread`, so a reply that landed meanwhile is not
archived unseen. Labels must already exist; check `list_labels`. Its
`move_to_folder` never points at Trash: that is how `update_thread` can trash a
thread, and trashing is not triage.

`create_or_update_reminder` is Superhuman's Remind Me: by default it removes the
thread from the inbox until `remind_at`, and it cancels itself if someone
replies first. Pass `mark_done: false` when the user wants the thread to stay
visible. A thread holds one reminder, so setting another reschedules it.

`unsubscribe` uses the list's own unsubscribe header. Leave `also_block` and
`also_trash` off unless the user asked for them, and never block a domain over
one message: `also_domain` silences everyone at that company.

Marking spam and trashing are not triage, and neither `mark_spam` nor
`trash_thread` is granted here, so each asks before it runs. If the user wants
a thread gone, name it and let them confirm.

## Anti-patterns

- **Archiving on the way through.** A thread marked done leaves the inbox;
  triage reports, the user decides.
- **Calling a thread urgent because the sender is.** Age and who spoke last
  decide where it goes.
- **Reading Other before Important.** Hundreds of notifications are not where
  the user's day is.
- **Treating the snippet as the ask.** It is the newest message, not the
  question.
