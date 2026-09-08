---
name: find-in-notion
description: Find what the workspace already says before you answer or write — search Notion, tell the canonical page from the stale copy, and cite what you used. Use when the user asks what's in Notion, refers to a doc, spec, or meeting note, or asks a question the workspace probably already answers.
argument-hint: the question, doc, or topic to look up
allowed-tools: mcp__notion__*
---

# Find what the workspace already says

A Notion workspace is a pile of drafts, duplicates, and one page everyone actually
uses. The job is not to return search results — it is to work out which page is the
one people act on, and to say so plainly.

## 1. Search the way people wrote, not the way they asked

Run the user's words first, then run the vocabulary the workspace is likely to use.
A question about "our refund rules" lives on a page called "Billing policy" or
"Support runbook"; the word "refund" may appear nowhere in the title. Two or three
searches with different vocabulary beats one search with better phrasing.

Search titles and body separately when the tools allow it. A title match is usually
the canonical page; a body match is usually someone referring to it.

## 2. Decide which page is canonical

When several pages cover the same ground, rank them:

1. **Recency of edit**, not creation. A page edited last week beats one written last
   year, even if the old one is longer.
2. **Where it sits.** A page inside a team space or database beats a loose page in
   someone's private area.
3. **Inbound links.** A page other pages link to is the one people found before you.

State which one you picked and why in a sentence. If two candidates genuinely
conflict — different numbers, contradictory instructions — that is the finding.
Report the conflict rather than silently choosing the newer one.

## 3. Read before you summarize

Search results give you titles and snippets. Snippets lie by omission: they are the
matching fragment, not the conclusion. Fetch the page and read it before you
characterize what it says.

## 4. Answer with the link

Every claim you take from Notion gets the page it came from. Someone will want to
check it, edit it, or argue with it, and a summary with no link makes all three
harder than reading the page themselves.

When the workspace has nothing, say so. "Nothing in Notion covers this" is a useful
answer and it is the moment to ask whether to write the page.

## Anti-patterns

- **Answering from the first hit.** Notion's search ranks on relevance, not
  authority. The first hit is often a meeting note that mentions the topic once.
- **Treating an archived or template page as current.** Check for both before
  quoting; templates read exactly like real policy.
- **Merging two pages into one answer.** If you found two, the user has two, and
  they need to know that.
- **Quoting a page's title as its content.** Titles go stale first — a page called
  "Q1 plan" is often full of Q3 work.
