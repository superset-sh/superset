---
name: browser
description: "Drive a workspace's in-app browser panes from the Superset CLI: list panes, open and navigate URLs, screenshot, read the console, evaluate JavaScript, and speak raw Chrome DevTools Protocol for click/type/scroll automation (browser-use / Playwright-class). Use when asked to open or navigate the in-app browser, screenshot or read a running web app, click or type through a web flow, fill a form, or verify UI in the pane the user is watching. Not for the system browser or headless scraping."
---

# Superset Browser Control

Drive the browser panes inside a Superset workspace with the `superset browser`
commands. High-level verbs cover the common 90%; a raw Chrome DevTools Protocol
(CDP) endpoint covers full interaction (mouse, keyboard, scroll, DOM). Every
operation runs in the pane the user can see, against the browser's real,
logged-in session — treat it accordingly (see Safety).

## Establish the control surface

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
   clearly — surface that rather than retrying.

When developing against a dev build of the desktop app in the Superset monorepo,
drive it with `bun scripts/dev-cli.ts browser …` (from the worktree) instead of
`superset browser …` — a plain dev CLI authenticates as your API org, not the
local-first dev host, so it finds no panes. See `docs/agent-tooling.md`.

## Find or open a pane

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

## Drive with the high-level verbs

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

## Full interaction over raw CDP

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

## Verify

Confirm outcomes from the page itself, not from the fact a command returned:
read back the URL (`location.href`), the DOM (`eval`), or a screenshot after
each meaningful step. Check `console` for page errors before declaring success.

## Safety

- **Real sessions.** Panes share one browser profile, so `eval` and CDP reach
  whatever the user is logged into in *any* in-app browser pane (GitHub, dashboards,
  …). Never read cookies, tokens, or credentials, exfiltrate session data, or act
  on authenticated sites beyond the task. When a step would submit a form,
  make a purchase, or take another consequential action, confirm with the user first.
- **Workspace scope.** Operations are scoped to the pane's workspace; don't try
  to reach panes in another workspace.
- **Leave state clean.** Don't close the user's tabs or clear history unless
  asked. Navigating away from what they were viewing is itself a change — prefer
  `--target new-tab` when you need a scratch pane.
