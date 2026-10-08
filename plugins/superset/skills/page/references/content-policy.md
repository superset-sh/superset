# Content policy and limits

Every page gets its own origin, `https://<pageId>.frame.supersetusercontent.com`, and
is framed with `sandbox="allow-scripts allow-same-origin allow-forms
allow-popups"`. So the page is a real origin of its own, and a locked-down
one. The policy is `default-src 'none'` with a short allowlist, and it is
enforced identically in the desktop pane and the web viewer:

- **No network from script.** `fetch`, `XHR`, `EventSource` and WebSockets are
  blocked to every host except Superset's own realtime service, which only the
  injected storage script uses. `fetch("data:...")` is blocked too: a page cannot read its own
  inlined data URIs back out. Write pages that need no network at all: bake
  the data into the document as a literal, or decode base64 in JavaScript
  (`atob`, then `Uint8Array.from`).
- **No compiling code at runtime.** `script-src` carries no `'unsafe-eval'`,
  so `eval()` and `new Function()` both raise an `EvalError`. This rules out
  inlining any library that builds functions at runtime, which includes
  several chart and templating libraries and a number of date and expression
  helpers. Check for it before you reach for a dependency: the page renders
  nothing and gives no visible reason why.
- **No scripts or stylesheets from a remote host, with one exception.**
  `<script src="https://…">` is always blocked. `<link rel="stylesheet"
  href="https://…">` is blocked too, except from `fonts.googleapis.com`, so
  a Google Fonts `<link>` tag works as-is. A directory publish's own files
  load fine (relative `src`/`href`), and any remote font *file* is allowed,
  so an inline `@font-face { src: url(https://…) }` also works for fonts
  from elsewhere.
- **Images, video and audio may be remote** (`https:`, `data:` or `blob:`),
  but prefer `data:` URIs for anything the page cannot do without: a reader
  with the network off sees nothing, and a remote image makes every reader's
  browser call that host directly, which hands a third party the IP address
  of everyone who opens the page.
- **Browser storage works** and is scoped to the page: `localStorage`,
  `sessionStorage`, `indexedDB` and cookies persist across reloads and across
  versions of the same page, but only in that one browser. Use it for a chosen
  tab or filter. For anything the page should remember for everyone, use
  `window.superset.storage` (see `storage.md`).
- **No parent access.** The viewer is a different origin, so
  reading `window.parent.document` or `window.top.location.href` throws. Superset injects
  its own scripts for comment anchoring and for the storage API; don't build a
  `postMessage` handshake of your own on top of them.
- **No form submission.** `form-action 'none'`: a `<form>` may exist for its
  controls, but submitting it goes nowhere. Handle inputs in script.

Scripts and popups *do* work. Inline JS runs normally, so charts, filters,
sorting, tabs, and interactive controls are all fine, as long as everything
they need is already in the file.

## Hard limits

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
4. **Full-bleed frame.** There is no chrome around the document: what you
   write is the whole surface, edge to edge. The injected theme paints the
   background (see below), so inherit it or set your own, never leaving it to
   the browser default.

Check before publishing: no `<script src>` or `<link rel="stylesheet">` pointing
at a remote host, no `fetch` of any kind including of a `data:` URI, no `eval`
or `new Function` anywhere in the file or in anything you inlined, page fits in
16 MB, and `superset pages preview` reports no console errors or blocked
requests: it renders the page under the same policy. Remote images, media and
font files are allowed, but they go blank offline, which is the price of not
inlining them.
