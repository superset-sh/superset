---
name: find-in-superhuman
description: Find and read mail in Superhuman — the thread where something was said, sent, or promised — by filtering on who, when, and which split before searching by words, reading the thread before answering, and linking the thread behind every claim. Use when the user asks what someone emailed, whether a reply or an invoice ever arrived, what the latest is on a thread, or what is on their calendar.
argument-hint: the person, subject, time range, or question to look up
allowed-tools: mcp__superhuman__list_accounts, mcp__superhuman__list_splits, mcp__superhuman__list_labels, mcp__superhuman__list_threads, mcp__superhuman__get_thread, mcp__superhuman__get_message, mcp__superhuman__get_attachment, mcp__superhuman__query_email_and_calendar
---

# Find the thread, then read it

An inbox answer is a thread, not a summary. Narrow to the threads that can hold
the answer, read the ones that do, and tie each claim to the message it came
from.

## 1. Know which account you are reading

`list_accounts` first. Superhuman can link several accounts to one connection,
and every other tool reads the primary one unless `acting_email` says
otherwise. When the question could span accounts (a personal and a work inbox),
run it once per account and say which one each result came from. An empty
result from the wrong account looks exactly like a thread that does not exist.

## 2. Filter on people and time before words

`list_threads` takes `from`, `to`, `subject_contains`, `body_contains`,
`start_date`, `end_date`, `labels`, and `split`. "The invoice from Stripe last
month" is a sender and a date range, not a body search. Address filters match
substrings, so a domain finds everyone at the company. `body_contains` is the
widest net and ranks nothing, so pair it with a sender or a date range rather
than running it alone.

Splits behave differently: `split` reads a precomputed membership list, so it
ignores the date filters, and `sort` reorders only the page you got back. To
walk a split by date, page with `cursor` and compare timestamps yourself.

## 3. Ask the question tool questions, not lookups

`query_email_and_calendar` answers a natural-language question across mail,
calendar, and contacts ("what is still waiting on me from the Acme deal", "what
is on my calendar Thursday"). Use it when the question spans threads or needs
the calendar. Do not use it to fetch a thread you already identified: read that
one with `get_thread`, because a synthesized answer blurs which message said
what.

## 4. Read the thread before answering

`get_thread` returns every message with bodies, recipients, attachments, drafts,
and any team comments. Long threads are trimmed to the root plus the newest
messages, so raise `message_limit` when the answer sits in the middle.
`get_message` fetches one message in full, with `include_raw_html` when a table
or a layout matters. `get_attachment` returns image and audio content directly
and a one-hour download link for everything else.

Mail sent or received in the last minute may not be indexed yet. When the user
says "I just sent it", wait and retry rather than reporting it missing.

## 5. Cite the thread

A mail claim names who said it and when, and links the thread:
`https://mail.superhuman.com/<account email>/thread/<thread id>`. A calendar or
contact claim from `query_email_and_calendar` has no thread to link; cite the
event (title, date, organizer) or the contact it came from. Quote the sentence
when wording matters (a price, a date, a commitment). If two messages disagree,
report both with their dates rather than picking one.

## Anti-patterns

- **Searching bodies when the user gave you a sender or a date.** Subjects and
  bodies drift; addresses and dates find the thread.
- **Answering from a snippet.** The listing shows the latest message's preview;
  the answer is usually earlier in the thread.
- **Trusting a split's sort or date filter.** Page through it and check the
  timestamps.
- **Reporting "nothing found" without the scope.** Name the account, filters,
  and date range you searched so an empty result can be checked.
