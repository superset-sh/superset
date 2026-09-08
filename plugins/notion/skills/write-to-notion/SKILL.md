---
name: write-to-notion
description: Write a page into Notion that someone else can find and trust — pick the right parent, check for the page that already exists, and structure it for a reader who was not in this conversation. Use when the user says to write up, document, save, or capture something in Notion, or to update an existing page.
argument-hint: what to write, and where it belongs
allowed-tools: mcp__notion__*
---

# Write a page someone will find later

An unfindable page is worse than no page: it splits the truth in two and neither
copy gets maintained. Most of the work happens before you create anything.

## 1. Look for the page that already exists

Search before you create, using the words a previous author would have used, not
the words in your prompt. Finding it changes the task from "write a page" to
"update a page" — which is almost always the better outcome, because the existing
page already has the links, the history, and the readers.

Update in place when the new content belongs to the same subject. Create a new page
only when the subject is genuinely new, or when the existing page is a record of a
moment — a meeting note, an incident write-up — that should not be rewritten after
the fact.

## 2. Put it where its readers are

A page's parent determines who ever sees it. Ask which team or database it belongs
to rather than defaulting to the first workspace root you can write to. When a
database is the right home, fill the properties — an entry with empty properties
falls out of every filtered view its readers use.

If you cannot tell where it belongs, ask. A page in the wrong place is harder to
find than a page that does not exist, because it looks like coverage.

## 3. Write for someone who was not here

Open with what the page is for, in one sentence, before any background. Then the
content, in the order it gets used rather than the order you discovered it. Date
anything time-bound and name the people involved — "we decided" is unreadable in
six months.

Link the sources: the issue, the PR, the page you took numbers from.

## 4. Show it before you commit it

For anything substantial, show the user the title, the parent, and the outline
before writing. Parent and title are what everyone else navigates by, and both are
awkward to correct once links exist.

After writing, hand back the URL.

## 5. Editing without clobbering

When updating, read the current content first and preserve what you are not
changing. Append to a page with history rather than replacing it, and keep the
existing headings unless they are wrong — other pages and people link to them.

## Anti-patterns

- **Creating a near-duplicate because search was hard.** Two pages named almost the
  same thing is the failure this skill exists to prevent.
- **Dumping the conversation.** A transcript is not a document. Write the
  conclusion, and the reasoning that survives.
- **Empty database properties.** They are how the page gets found; skipping them
  hides the page in plain sight.
- **Rewriting a dated record.** Meeting notes and incident reports are evidence of
  a moment. Add to them; do not revise them.
