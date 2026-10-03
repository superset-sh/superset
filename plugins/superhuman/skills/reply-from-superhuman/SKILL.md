---
name: reply-from-superhuman
description: Draft a reply, a follow-up, or a new email in Superhuman in the user's own voice — read the whole thread first, reuse an existing draft instead of adding a second one, keep the right people on the thread, and leave sending to the user unless they asked for it. Use when the user says reply to, answer, follow up with, draft an email to, or send, or when a triage turned up threads that need a response.
argument-hint: the thread or person to write to, and what the email should say
allowed-tools: mcp__superhuman__list_accounts, mcp__superhuman__list_threads, mcp__superhuman__get_thread, mcp__superhuman__get_message, mcp__superhuman__get_attachment, mcp__superhuman__list_drafts, mcp__superhuman__get_draft, mcp__superhuman__get_draft_send_status, mcp__superhuman__create_or_update_draft, mcp__superhuman__discard_draft, mcp__superhuman__list_snippets, mcp__superhuman__get_snippet, mcp__superhuman__undo_send
---

# Write it as the user would, and let them send

A draft in Superhuman is the user's to send; the job is to make it the one they
would have written. Read the whole thread, draft once, and stop at the draft.

## 1. Read the thread end to end

`get_thread` with drafts and comments included. The last message is not the
whole ask: an earlier message often holds the question, a team comment may say
how to answer it, and the question itself may sit in an attachment.
`get_attachment` returns images and audio directly; for anything else it
returns a download link, so a PDF or a spreadsheet is unread until the user
opens it. When the thread is trimmed, raise `message_limit`. Note who is on the thread and who
spoke last; the reply goes to the person waiting, not to whoever wrote first.

## 2. Look for a draft before writing one

`list_drafts` filtered by `thread_id`. If a draft exists, `get_draft` and read
it: the user may have started a reply in Superhuman, and the right move is to
finish theirs, not to add a second one. Check `get_draft_send_status` before
touching it. `pending` means it is already on its way, and a draft the user
sent from Superhuman minutes ago looks exactly like one that still needs work.

## 3. Draft with instructions, not prose

`create_or_update_draft` with `type` `reply` or `reply_all` and the thread id
for a thread, or `type` `new` with `to` for a fresh email, where `subject` can
be left for the writer and `from` picks one of the user's aliases. Give it
`instructions` (what to say, what to ask, what tone the thread calls for) and
let it write in the user's style and signature. Pass `body` only when the user
dictated exact wording, or when forwarding, where `body` holds the intro and
the forwarded message is appended for you.

- `reply_all` when others on the thread need the answer; `reply` when the user
  is answering one person. Keep the CCs the thread already had.
- Omit `subject` on a reply; it inherits the thread's.
- One question per email. Say what was done and what is asked, and nothing
  about what you plan to do later.
- Team snippets (`list_snippets`, `get_snippet`) hold wording the team already
  agreed on for common replies; start from one when it fits.

To revise, pass `draft_id` and `thread_id` back so the draft updates in place.
Recipient fields replace rather than merge, so pass the full list each time. An
update can rewrite the subject, so when it carries a prefix or a ticket tag
that must survive, discard the draft and recreate it instead.

## 4. Stop at the draft

Report the draft: to, cc, subject, the body, and that it is in the user's
Drafts in Superhuman. Sending is the user's action, so this skill does not
pre-approve `send_draft` and a send always asks first. When the user does ask
you to send, set an `undo_timeout` and report the undo token, and call
`undo_send` the moment they say stop. `send_at` schedules a send; `smart_send`
lets Superhuman pick the time.

## Anti-patterns

- **Drafting from the snippet.** The ask is in the thread, not the preview.
- **A second draft on a thread that has one.** Finish the existing one.
- **Replying to the wrong person.** The reply goes to whoever is waiting; the
  thread's starter may have left it long ago.
- **Sending because the user said "reply".** Reply means draft. Send means
  send.
- **Writing in your voice.** Instructions produce the user's style; a pasted
  body produces yours.
