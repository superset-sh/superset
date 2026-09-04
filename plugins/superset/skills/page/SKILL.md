---
name: page
description: Build and publish a self-contained HTML page to Superset, then answer the comments readers pin to it. Use when the user asks to make or publish a page, turn a report, dashboard, chart, doc, or analysis into a shareable link, update or re-version a page already published, or work through comments left on one, including "make me a page for this", "publish this as a page", "share it as a link", "add a version", "address the comments on that page".
argument-hint: what the page should show, or a page id/slug to update
allowed-tools: Bash(superset:*)
---

# Superset Pages

A page is an **`.html` document** published to a URL people in the org can
open. Publish a single file and it must be self-contained; publish a directory
and its `index.html` is the document, with the images, stylesheets, and media
it references by relative path published alongside it. Every publish mints a version, so a page has history. Readers can
pin a comment to any element on it, and those comments come back to an agent to
fix. That is what makes a page a working surface rather than an export.

Pages are served from their own origin under a strict content policy. Most of
the work in this skill is respecting that policy; a page that ignores it looks
fine locally and breaks silently once published.

## When a page is the right surface

Publish a page when the work has a **reader** and wants a **link**: a report
someone will skim, a dashboard for a standup, a comparison table, a diagram, a
walkthrough of what you changed.

Don't publish when the artifact belongs in the repo (source, docs, config: put
those in files and commit them), or when it genuinely needs a server, a
database, or a login. A page has none of those.

If you're unsure, ask. Publishing is cheap and reversible, but a page the user
didn't want is noise in their org's list.

## The content policy, which is what actually bites

Every page gets its own origin, `https://<pageId>.frame.supersetusercontent.com`, and
is framed with `sandbox="allow-scripts allow-same-origin allow-forms
allow-popups"`. So the page is a real origin of its own, and a locked-down
one. The policy is `default-src 'none'` with a short allowlist, and it is
enforced identically in the desktop pane and the web viewer:

- **No network from script.** `fetch`, `XHR`, `EventSource` and WebSockets are
  all blocked, and so is `fetch("data:...")`: a page cannot read its own
  inlined data URIs back out. Write pages that need no network at all: bake
  the data into the document as a literal, or decode base64 in JavaScript
  (`atob`, then `Uint8Array.from`).
- **No compiling code at runtime.** `script-src` carries no `'unsafe-eval'`,
  so `eval()` and `new Function()` both raise an `EvalError`. This rules out
  inlining any library that builds functions at runtime, which includes
  several chart and templating libraries and a number of date and expression
  helpers. Check for it before you reach for a dependency: the page renders
  nothing and gives no visible reason why.
- **No scripts or stylesheets from a remote host.** `<script
  src="https://…">` and `<link rel="stylesheet" href="https://…">` are
  blocked, Google Fonts `<link>` tags included. A directory publish's own
  files load fine (relative `src`/`href`), and a remote font *file* is
  allowed, so an inline `@font-face { src: url(https://…) }` works.
- **Images, video and audio may be remote** (`https:`, `data:` or `blob:`),
  but prefer `data:` URIs for anything the page cannot do without: a reader
  with the network off sees nothing, and a remote image makes every reader's
  browser call that host directly, which hands a third party the IP address
  of everyone who opens the page.
- **Storage works** and is scoped to the page: `localStorage`,
  `sessionStorage`, `indexedDB` and cookies persist across reloads and across
  versions of the same page. Use it for a chosen tab or filter, never for
  anything the page cannot rebuild from its own content.
- **No parent access.** The viewer is a different origin, so
  `window.parent.document` and `window.top.location` throw. Superset injects
  one script into the page for comment anchoring; nothing else listens to
  `postMessage`, so don't build a handshake on it.
- **No form submission.** `form-action 'none'`: a `<form>` may exist for its
  controls, but submitting it goes nowhere. Handle inputs in script.

Scripts and popups *do* work. Inline JS runs normally, so charts, filters,
sorting, tabs, and interactive controls are all fine, as long as everything
they need is already in the file.

## The other hard limits

1. **`.html` only.** Any other extension is rejected at the CLI.
2. **One file, or one directory.** `superset pages publish ./report/`
   publishes a directory: `index.html` is the page, and every other file
   ships at its relative path, so `<video src="demo.mp4">`,
   `<link href="site.css">` and `<script src="app.js">` all work. Asset
   paths may not start with `versions/`, `files/`, `_superset/` or `~`, or
   be named `thumbnail.jpg`. Assets go up to 1 GiB each; on republish,
   unchanged assets are not re-uploaded. Prefer H.264 MP4 or WebM for
   video: iPhone `.mov` recordings may not play in every browser. Remote
   CDN links and external stylesheets are still blocked; for a single-file
   page, inline all CSS and JS and embed images as `data:` URIs.
3. **16 MB maximum for the HTML document itself**, and base64 `data:` URIs
   count toward it at ~1.37× their
   raw size. A few small SVGs or PNGs are fine; a photo gallery is not.
4. **Full-bleed frame with a white default background.** Set your own `body`
   background explicitly rather than inheriting.

Check before publishing: no `<script src>` or `<link rel="stylesheet">` pointing
at a remote host, no `fetch` of any kind including of a `data:` URI, no `eval`
or `new Function` anywhere in the file or in anything you inlined, page fits in
16 MB, opens correctly from `file://` with the network disabled. Remote images
are the one permitted exception: they go blank offline, which is the price of
not inlining them.

## Design

The page should look deliberate. Avoid the house style of generic AI output:
purple-to-blue gradients, everything centered, uniform pill-rounded corners on
every element, Inter (or system-sans) for every line, and emoji as section
icons. Those read as "generated" at a glance.

Instead: pick a real palette and hold to it, set a typographic scale with actual
contrast between heading and body, and let the layout follow the content: a
data-dense table wants a wide flush-left page, a narrative report wants a
measure of 65-75 characters. Use whitespace for grouping instead of borders on
everything.

Make it responsive with relative units and flex/grid, and give wide content
(tables, code blocks, charts) its own `overflow-x: auto` container so the page
body never scrolls sideways.

If the user's project has a design system, read it first and match it.

## Publish

```bash
superset pages publish report.html \
  --title "Q3 pipeline" \
  --description "Where every open deal stands going into Q4" \
  --label "first draft"

# Or a directory: index.html is the page, everything else rides along
superset pages publish ./report/ --title "Q3 pipeline"
```

`--title` defaults to the filename with dashes and underscores turned into
spaces, so name the file well or pass the flag. `--label` is what shows in
version history; write what changed, not "update".

**Every page belongs to a workspace.** The CLI records the file's path relative
to the workspace root as the page's entry path, and that path is the key:
publish the same path again and it becomes **version 2 of the same page** rather
than a second page.

Write the `.html` **inside the workspace**, not in `/tmp` or an agent
scratchpad. A file outside the workspace has no relative path, so it falls back
to being keyed by filename alone (`/external/report.html`), which means two
unrelated files with the same name will version each other. Keeping it in the
workspace also keeps the source next to the work it describes.

Outside a workspace entirely, with no `$SUPERSET_WORKSPACE_ID` and no
`--workspace`, the publish is refused rather than creating a page nothing can
list. Pass `--page <id>` to add a version to a page you already have.

Keep the source file. It is the only copy you can edit; the published version is
derived from it.

## Update an existing page

Two routes, and the difference matters:

```bash
superset pages publish report.html --label "fixed Q3 totals"   # same path in the same workspace
superset pages publish report.html --page <page-id> --label "…" # anywhere, explicit
```

Use `--page` whenever you're outside the original workspace, the file moved, or
you're not certain the path still matches. A wrong guess doesn't error; it
quietly creates a *new* page, and the reader's link keeps showing the old one.

## Visibility

`org` (the default) or `just_me`, set with `--visibility`. Anything wider is not
settable from the CLI. A new page is readable by the org, because that is what a
page is usually for; pass `--visibility just_me` when the user wants a draft only
they can open.

Visibility belongs to the page, not to the publish. Republishing never changes
it, so a page someone narrowed to `just_me` stays that way through every later
version, and a page created before `org` became the default is still `just_me`
until someone widens it.

## Read a page back

```bash
superset pages list --workspace <id>     # or omit --workspace for the whole org
superset pages get <page-id-or-slug>
superset pages versions <page-id-or-slug>
superset pages pull <page-id-or-slug> --version 2 > v2.html
```

`pull` writes HTML to stdout; use it to recover a source file you no longer
have, or to diff what actually shipped against what you have locally.

## Answer comments

A reader clicks an element on the published page and pins a comment to it. When
they hand the thread to an agent, the prompt that arrives names the page, and
for each thread gives a `thread:` id, an `at:` CSS selector path from `<body>`,
and the element's text at the time of writing.

**That selector points into the published HTML, which is the same document as
your source file.** That document is the `index.html` you published, not any
asset beside it, so the anchor locates the exact element to edit. Quoted text alone doesn't; the same words often
appear more than once.

The loop, in order:

```bash
superset pages comments list --page <page-id-or-slug>
# edit the source file, fixing what each thread asked for
superset pages publish report.html --label "addressed review comments"
superset pages comments reply --thread <thread-id> "Recomputed from the Q3 close; the total is 1.42M now."
superset pages comments resolve --thread <thread-id>
```

Rules that keep this honest:

- **Fix the source, then republish, then reply.** A reply pointing at a version
  that doesn't exist yet wastes the reader's time.
- **Reply before resolving.** Resolving silently closes the thread with no
  record of what changed. Say what you did, then close it.
- **Only answer threads that were handed to you.** Other threads on the page are
  someone else's conversation.
- **Don't resolve what you didn't fix.** If a comment asks for something you
  can't do or disagree with, reply saying so and leave it open for a human.

Reopen with `superset pages comments resolve --thread <id> --reopen`.

## When it fails

| Symptom | Cause |
| --- | --- |
| `Only .html files can be published as a page` | Wrong extension, or you pointed at a directory |
| Publish rejected on size | Over 16 MB; the `data:` URIs are almost always why |
| A new page appeared instead of a version | Published from outside the workspace, or the path changed; use `--page <id>` |
| Reader gets a 404 | Page is `just_me`, either set that way or created before `org` became the default; widen it with `--visibility org` |
| Page is blank once published, fine locally | A script threw, or the page loads a script or stylesheet from a remote host |
| A chart or widget renders nothing and logs no error | The library compiles code with `new Function` or `eval`, which the policy refuses; pick one that does not |
| Fonts missing when published | A Google Fonts `<link>`; inline the `@font-face` instead |
| Images missing when published | `http://` URLs, or the reader is offline; embed as `data:` URIs |
