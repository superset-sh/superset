---
name: browser
description: "Drive web pages with one of two engines: a workspace's in-app browser panes via the Superset CLI (list, open, navigate, screenshot, read console, eval, raw Chrome DevTools Protocol — the default), or Browser Use 3.0 for a system browser or standalone automation the panes cannot reach. Use when asked to open or navigate a browser, screenshot or read a running web app, click or type through a web flow, fill a form, or verify UI. Default to the in-app pane; use Browser Use only when the panes can't reach the target, and ask before installing it."
---

# Superset Browser Control

Two engines drive browser work. The **default** is the browser panes inside a
Superset workspace, driven with the `superset browser` commands — every
operation runs in the pane the user can see, against the pane's real,
logged-in session. When the panes cannot reach the target, **Browser Use 3.0**
drives a standalone browser instead.

## Choose an engine

Before either engine: if a plain HTTP request or an API can answer (a public
page, docs, a JSON endpoint), use `curl` or your fetch tool and skip the
browser entirely.

- **In-app browser pane (default).** The page is (or can be) open in a
  Superset workspace pane: previewing a dev server, verifying UI the user is
  watching, clicking through a flow in the app. Use this unless it cannot
  reach the target.
- **Browser Use 3.0.** Standalone automation the panes cannot reach: a real
  Chrome/Chromium window outside Superset, a host with no desktop app attached
  (pane commands error clearly there), or work that needs an isolated or cloud
  browser. Only use it if it's already installed or the user authorizes
  installing it — ask first, never install silently. Never attach it to the
  user's signed-in browser profile without explicit consent.

### Offering Browser Use for a pane

Browser Use can also drive an in-app pane (see its engine section), and for some
pane tasks it's the nicer tool. When one of these fits and Browser Use isn't
already installed, offer it **once**, low-pressure, then respect the answer — if
the user declines or doesn't answer, use `superset browser` and don't ask again
this session. Skip the offer entirely for a single screenshot, one `eval`, or a
plain read: the default primitive already nails those, so an offer is just noise.

Offer when the pane task is one of:

- **Delegating a goal.** The user wants an open-ended objective run end to end
  ("book the cheapest flight", "get through this signup") rather than driving it
  step by step — Browser Use's agent loop plans, acts, and recovers on its own.
- **Resilient multi-step interaction.** A flow of several clicks/typing/waits,
  especially on a UI likely to shift, where its accessibility-tree targeting and
  self-healing beat hand-written CDP.
- **A recorded run.** The user wants a video or walkthrough of the flow —
  Browser Use captures a frame-per-action trace and exports it.

Frame it by what it actually gives (smoother, more resilient multi-step
interaction; autonomy; a recording), not raw speed — for simple ops the default
path is faster. A workable phrasing: "I can hand this to Browser Use — it drives
multi-step flows more cleanly / can run this goal autonomously / can record it —
but it's a ~1-minute one-time install. Want that, or should I just drive the
pane directly?" Installing still follows the Browser Use preflight below (ask
first).

## Engine: in-app browser panes (default)

High-level verbs cover the common 90%; a raw Chrome DevTools Protocol (CDP)
endpoint covers full interaction (mouse, keyboard, scroll, DOM).

### Establish the control surface

1. Run `superset browser --help` and require `list`, `open`, `navigate`,
   `screenshot`, `eval`, `console`, and `cdp`. If absent, run `superset update`
   and recheck. Do not substitute unsupported commands. The app-bundled CLI
   (`~/.superset/bin/superset`) updates only with the desktop app — if it lacks
   `browser`, updating the app (not the CLI) is the fix; check `type -a superset`
   for another install before giving up.
2. Resolve the workspace. Inside a workspace, use `$SUPERSET_WORKSPACE_ID`;
   otherwise `superset workspaces list --local --json` and pick the target.
   Pass `--host <id>` for a remote host.
3. Browser panes live in the desktop app. A host with no desktop attached
   (a standalone `superset start`) has no panes and every command errors
   clearly — surface that rather than retrying, and consider the Browser Use
   engine if the task still needs a browser there.

When developing against a dev build of the desktop app in the Superset monorepo,
drive it with `bun scripts/dev-cli.ts browser …` (from the worktree) instead of
`superset browser …` — a plain dev CLI authenticates as your API org, not the
local-first dev host, so it finds no panes. See `docs/agent-tooling.md`.

### Find or open a pane

Every pane has a stable `paneId`. Discover the panes already open in a
workspace:

```bash
superset browser list --workspace <id> --json
```

Open a URL and get the resulting `paneId` back. `--target new-tab` opens a
fresh tab and focuses it; the default `current-tab` reuses the active browser
pane. Opening requires the workspace to be visible in the desktop app (the
renderer creates the pane), so if it times out, ask the user to open the
workspace.

```bash
superset browser open --workspace <id> --url https://example.com --json
superset browser open --workspace <id> --url http://localhost:3000 --target new-tab --json
```

Hold the `paneId` for every subsequent operation. `paneId` is scoped to its
workspace: pass the same `--workspace` you opened it under, or the operation is
rejected.

### Drive with the high-level verbs

```bash
# Point an existing pane at a new URL
superset browser navigate --workspace <id> --pane <paneId> --url https://…

# Capture a PNG (base64 by default; --out writes a file)
superset browser screenshot --workspace <id> --pane <paneId> --out shot.png

# Read the pane's captured console output
superset browser console --workspace <id> --pane <paneId> --max-lines 100

# Evaluate JavaScript in the page and return the result
superset browser eval --workspace <id> --pane <paneId> \
  --code "document.querySelector('h1')?.textContent"
```

`eval` is the ergonomic path for reading or nudging the DOM (`.textContent`,
`.value = …`, `element.click()`, `location.href`); an expression that throws
comes back as a command error, not a value. `open` and `navigate` accept only
`http(s)` and `about:` URLs — bare input like `example.com` or `localhost:3000`
is upgraded, but a `file://`, `chrome://`, `data:`, or other scheme is rejected
with a clear error instead of silently turning into a web search.

Take a screenshot to *see* state, `eval` to *read* structured data, and
`console` to check for page errors. Prefer these over raw CDP unless you need
real input events.

### Import logins from another browser

Copy a system browser's cookies into a pane's session so the pane is signed in
to the same sites the user already uses. This widens access to their accounts,
so run it **only with the user's go-ahead** — but you *can* proactively **offer**
it, which is how most users will discover the feature: when a pane hits a login
wall for a site the user uses in their own browser, suggest importing that login
(e.g. "want me to bring over your login from Comet?") instead of just stopping.
They still decide, and you still **never choose the source browser for them**:
people run several Chromium browsers (Chrome, Edge, Brave, Arc, Dia, Comet), and
only the user knows which one holds the session they want. macOS only — it reads
the browser's Keychain key, and the first run prompts them to allow it. It is
**read-only on the source browser**: it copies the cookie database and never
modifies, moves, or clears the source's own logins.

Always follow this order — list, ask, then import:

1. **List** the installed browsers and **let the user pick one.** Run with no
   `--from` to enumerate what's detected, present the choices, and ask which to
   use. Do not default to the first, the busiest, or one you used before.

   ```bash
   superset browser import-login --workspace <id> --pane <paneId>
   ```

2. **Import** from the browser they chose, then reload the pane to apply it:

   ```bash
   superset browser import-login --workspace <id> --pane <paneId> --from Comet
   superset browser navigate --workspace <id> --pane <paneId> --url https://…
   ```

   `--profile <name>` disambiguates a browser with several profiles; if `--from`
   matches more than one, the command errors and lists them rather than guessing.

Only cookies the source browser has **written to disk** can import — many sites
keep auth in *session cookies* that live in browser memory and are deleted on
quit, so they never persist. **Have the user quit the source browser first** to
flush its logins to disk. A result of `imported: 0, keyUnavailable: true` means
the Keychain prompt was denied — ask them to allow it and retry.

### Full interaction over raw CDP

For clicking, typing, scrolling, waiting on selectors, or any browser-use /
Playwright-class flow, get a raw CDP WebSocket endpoint for the pane:

```bash
superset browser cdp --workspace <id> --pane <paneId> --json
```

The printed `url` is a WebSocket that speaks CDP directly (`Page`, `Runtime`,
`DOM`, `Input`, `Network`, …). It embeds an auth token — treat the URL as a
secret; do not paste it into shared logs. Point any CDP client at it, or drive
it directly. Minimal pattern (Node 22+ / Bun):

```js
const ws = new WebSocket(cdpUrl);
let id = 0;
const send = (method, params) =>
  new Promise((resolve) => {
    const myId = ++id;
    const h = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== myId) return;
      ws.removeEventListener("message", h);
      resolve(m.result);
    };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

await new Promise((r) => ws.addEventListener("open", r, { once: true }));
await send("Page.enable");
await send("Runtime.enable");
await send("DOM.enable");

// Focus a text field by resolving its center, then dispatching a real click.
const sel = "#email";
const { result } = await send("Runtime.evaluate", {
  expression: `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`,
  returnByValue: true,
});
if (!result.value) throw new Error(`not found: ${sel}`);
const { x, y } = result.value;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });

// Confirm the field is focused before typing, then type into it.
const focused = await send("Runtime.evaluate", {
  expression: `document.activeElement === document.querySelector(${JSON.stringify(sel)})`,
  returnByValue: true,
});
if (focused.result.value) await send("Input.insertText", { text: "ada@example.com" });
```

Clicking a button that submits a form, makes a purchase, or takes another
consequential action is a step to confirm with the user first — not something to
model in an unattended example.

Conventions that keep CDP flows reliable:

- One CDP session per pane. A second concurrent attach is rejected with
  WebSocket close code 1013 (Try Again Later) until the first disconnects —
  close the socket when done, then retry.
- After a click that should focus a field, verify `document.activeElement`
  before `Input.insertText`, and poll a selector/state check after each action
  rather than sleeping a fixed time — the guest can repaint slowly when the
  window is backgrounded.
- To submit with Enter, the `keyDown` must carry the character:
  `Input.dispatchKeyEvent` with `{type: "keyDown", key: "Enter", code: "Enter",
  text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13}` followed by the
  matching `keyUp`. Without `text: "\r"` the event fires but no char is
  generated, so forms silently don't submit.
- `Page.navigate` obeys the same scheme allowlist as the CLI; `file://` and
  `chrome://` are refused.

## Engine: Browser Use 3.0

[Browser Use](https://docs.browser-use.com/open-source/browser-use-cli) 3.0 is
a CLI that executes Python against a browser over CDP: helpers are
pre-imported, and a daemon manages the browser connection. Reach for it only
per the routing above.

### Preflight

1. Check for an install: `command -v browser-use && browser-use --version`.
2. If missing, **ask the user before installing anything** (including `uv`
   itself). With authorization, install it so the bare `browser-use` command
   below is on `PATH`:

   ```bash
   uv tool install browser-use
   browser-use --help
   ```

   `uvx --from 'browser-use[cli]' browser-use …` also works, but it's an
   ephemeral run that does **not** put `browser-use` on `PATH` — every call
   must carry the full `uvx --from 'browser-use[cli]'` prefix. The bare
   `browser-use …` invocations in the rest of this section assume the
   `uv tool install` above; prefer it unless you deliberately want one-off runs.

3. Read the engine's own instructions before driving: `browser-use skill`
   prints the upstream skill text with the current helper reference and
   workflow. Follow it for the details; this section covers only routing,
   consent, and cleanup. `browser-use --doctor` diagnoses install, daemon,
   and browser-connection problems.

### Connect to a browser — consent first

By default the CLI attaches to the user's **running Chrome/Chromium over CDP**
— their real, signed-in profile — and if Chrome lacks remote debugging it will
prompt to enable it. Never take that path without the user's explicit consent
for this task; "use my browser/session" from the user is consent, silence is
not. Without it, use one of:

- A scratch browser you launch yourself (e.g. Chromium with a throwaway
  `--user-data-dir` and a debug port), pointed at via the `BU_CDP_URL` or
  `BU_CDP_WS` environment variables.
- A Browser Use cloud browser: `browser-use auth login`, then
  `start_remote_daemon("<name>")` and prefix later calls with
  `BU_NAME=<name>`. Cloud browsers bill until stopped — ask before starting
  one, and stop it when done.
- An in-app pane, if you specifically want Browser Use's harness against a
  workspace pane: export the pane's own CDP endpoint (the `url` from
  `superset browser cdp … --json`) as `BU_CDP_WS`, then run `browser-use`.
  The pane presents itself as a single page target, so Browser Use attaches
  to it directly. This needs no profile consent (it's the workspace's own
  pane, not a signed-in system browser) — but for panes the default
  `superset browser` verbs above are simpler and need no install, so prefer
  them unless you have a reason to use Browser Use here.

### Drive

Pass Python via heredoc; helpers are pre-imported. First navigation is
`new_tab(url)`, not `goto_url(url)`:

```bash
browser-use <<'PY'
new_tab("http://localhost:3000")
wait_for_load()
print(page_info())
PY
```

`js(...)` evaluates in the page, `cdp("Domain.method", ...)` speaks raw CDP,
and `click_at_xy(x, y)` clicks — prefer accessibility-tree targeting as the
upstream skill text describes. For MCP-capable hosts the same package also
runs as an MCP server: `uvx --from 'browser-use[cli]' browser-use --mcp`.

### Clean up

Stop any cloud daemon you started (`stop_remote_daemon("<name>")` — it bills
until stopped). Close tabs you opened in a browser you attached to, and leave
the user's own tabs, session, and browser settings as you found them. If you
launched a scratch browser, quit it and delete its throwaway profile.

## Verify

Whichever engine, confirm outcomes from the page itself, not from the fact a
command returned: read back the URL (`location.href`), the DOM (`eval` /
`js(...)`), or a screenshot after each meaningful step. Check the console for
page errors before declaring success.

## Safety

- **Real sessions.** In-app panes share one browser profile, so `eval` and CDP
  reach whatever the user is logged into in *any* in-app browser pane (GitHub,
  dashboards, …); Browser Use attached to the user's Chrome reaches everything
  they're signed into. Never read cookies, tokens, or credentials, exfiltrate
  session data, or act on authenticated sites beyond the task. When a step
  would submit a form, make a purchase, or take another consequential action,
  confirm with the user first. Login walls stay with the user: never enter
  passwords or MFA yourself — but at a login wall you may **offer to import their
  login** from their own browser (see "Import logins from another browser")
  rather than only stopping.
- **Importing logins.** `import-login` copies real session cookies into the
  pane's jar — run it only with the user's go-ahead (offering it at a login wall
  counts), and never chain it into acting on the sites it signs you into beyond
  what they requested. It never writes to the source browser.
- **Ask before widening access.** Never install Browser Use (or `uv`), enable
  Chrome remote debugging, attach to the user's signed-in profile, or start a
  billed cloud browser without explicit consent. If consent is refused, report
  what you couldn't do — don't work around it with another mechanism.
- **Workspace scope.** Pane operations are scoped to the pane's workspace;
  don't try to reach panes in another workspace.
- **Leave state clean.** Don't close the user's tabs or clear history unless
  asked. Navigating away from what they were viewing is itself a change —
  prefer `--target new-tab` (panes) or a fresh tab (Browser Use) when you need
  a scratch surface.
