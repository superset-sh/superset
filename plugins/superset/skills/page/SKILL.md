---
name: page
description: Build and publish a self-contained HTML page to Superset, then answer the comments readers pin to it. Use when the user asks to make or publish a page, turn a report, dashboard, chart, doc, or analysis into a shareable link, update or re-version a page already published, or work through comments left on one, including "make me a page for this", "publish this as a page", "share it as a link", "add a version", "address the comments on that page".
argument-hint: what the page should show, or a page id/slug to update
allowed-tools: Bash(superset:*)
---

# Superset Pages

A page is **one self-contained `.html` file** published to a URL people in the
org can open. Every publish mints a version, so a page has history. Readers can
pin a comment to any element on it, and those comments come back to an agent to
fix. That is what makes a page a working surface rather than an export.

Pages are served inside a locked-down iframe. Most of the work in this skill is
respecting that sandbox; a page that ignores it looks fine locally and breaks
silently once published.

## When a page is the right surface

Publish a page when the work has a **reader** and wants a **link**: a report
someone will skim, a dashboard for a standup, a comparison table, a diagram, a
walkthrough of what you changed.

Don't publish when the artifact belongs in the repo (source, docs, config: put
those in files and commit them), or when it genuinely needs a server, a
database, or a login. A page has none of those.

If you're unsure, ask. Publishing is cheap and reversible, but a page the user
didn't want is noise in their org's list.

## The sandbox, which is what actually bites

The frame is `sandbox="allow-scripts allow-forms allow-popups"` with
`referrerPolicy="no-referrer"`. **`allow-same-origin` is deliberately absent**,
so the page runs in an *opaque origin*. Consequences, all of them silent in a
local browser and fatal once published:

- **Every storage API throws on access.** `localStorage`, `sessionStorage`,
  `indexedDB`, `caches`, and `document.cookie`. Not "returns null", not "returns
  an empty string": a `SecurityError` that takes the rest of your script with
  it. `document.cookie` is the one that catches people, because everywhere else
  on the web it degrades quietly. Hold state in a plain variable, and wrap any
  access you cannot avoid in `try`/`catch`.
- **`navigator.serviceWorker` is unavailable** for the same reason.
- **`fetch`/`XHR`/WebSocket send `Origin: null`**, which almost every API and
  CORS policy rejects. Write pages that need no network for their data: bake it
  into the document as a literal.
- **`fetch("data:...")` is blocked as well.** `connect-src` permits no `data:`
  on either viewer, so a page cannot read its own inlined data URIs back out.
  That is counterintuitive when the rule next to it says to inline everything,
  and it is exactly the workaround people reach for. Decode base64 in
  JavaScript instead (`atob`, then `Uint8Array.from`), or emit the value as a
  JavaScript literal so nothing has to be decoded at all.
- **No parent access.** Reading `window.parent.document`, `window.top.location`
  or `window.frameElement` throws a `SecurityError`. `postMessage` to the parent
  is the exception; it does not throw, it simply has nothing listening, so
  don't build a handshake on it.

`location.origin` is not your app's origin: the desktop pane serves the page
under a `superset-page://` scheme and the web viewer frames it as `srcdoc`, and
either way cross-frame checks see the origin as `null`.

Scripts, forms, and popups *do* work. Inline JS runs normally, so charts,
filters, sorting, tabs, and interactive controls are all fine, as long as
everything they need is already in the file.

## The other hard limits

1. **`.html` only.** Any other extension is rejected at the CLI.
2. **One file.** There is no asset upload. Inline all CSS and JS. No CDN
   links, no external stylesheets, and no web fonts from a remote host:
   scripts and stylesheets are refused outright, and a remote font fails CORS
   from an opaque origin.
3. **No compiling code at runtime.** `script-src` carries no `'unsafe-eval'`,
   so `eval()` and `new Function()` both raise an `EvalError`. This rules out
   inlining any library that builds functions at runtime, which includes
   several chart and templating libraries and a number of date and expression
   helpers. Check for it before you reach for a dependency: the page renders
   nothing and gives no visible reason why.
4. **Remote images do load,** on both viewers, so `<img src="https://...">`
   works. Prefer a `data:` URI anyway. A remote image makes every reader's
   browser call that host directly, which hands a third party the IP address
   of everyone who opens the page, and it breaks the moment the host does.
5. **3 MB maximum**, and base64 `data:` URIs count toward it at ~1.37× their
   raw size. A few small SVGs or PNGs are fine; a photo gallery is not.
6. **Full-bleed frame with a white default background.** Set your own `body`
   background explicitly rather than inheriting.

Check before publishing: no remote script, stylesheet, or font URLs, no `eval`
or `new Function` anywhere in the file or in anything you inlined, no `fetch`
of any kind including of a `data:` URI, no bare `localStorage`, and the page
fits in 3 MB. Opened from `file://` with the network disabled it should still
render, with remote images the one permitted exception: they go blank offline,
which is the price of not inlining them.

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
your source file.** A page is one self-contained file, so the anchor locates
the exact element to edit. Quoted text alone doesn't; the same words often
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
| Publish rejected on size | Over 3 MB; the `data:` URIs are almost always why |
| A new page appeared instead of a version | Published from outside the workspace, or the path changed; use `--page <id>` |
| Reader gets a 404 | Page is `just_me`, either set that way or created before `org` became the default; widen it with `--visibility org` |
| Page is blank once published, fine locally | A script threw: usually `localStorage`, or a fetch of any kind |
| A chart or widget renders nothing and logs no error | The library compiles code with `new Function` or `eval`, which the sandbox refuses; pick one that does not |
| Fonts missing when published | Remote font URLs; a font fails CORS from an opaque origin, so inline it as a `data:` URI |
