---
name: browser
description: Open, navigate, screenshot, read, click, and type in web pages from an agent. Use when the user asks to open a URL, preview or verify a running web app, check a page's console, fill a form, click through a web flow, or automate anything in a browser, including "open localhost:3000", "screenshot the page", "what does the console say", "click the submit button". Drives the in-app browser pane of a Superset workspace by default and Browser Use for browsers the panes cannot reach.
argument-hint: URL or what to do in the browser
allowed-tools: Bash(superset:*) Bash(curl:*)
---

# Superset Browser Control

Drive web pages through the browser panes inside a Superset workspace with the
`superset browser` commands. Every operation runs in the pane the user can see,
against the pane's real, logged-in session. A raw Chrome DevTools Protocol (CDP)
endpoint covers anything the high-level verbs don't.

## Choose a surface

- If a plain HTTP request or an API can answer (a public page, docs, a JSON
  endpoint), use `curl` or your fetch tool and skip the browser.
- Default to the in-app pane whenever the page is, or can be, open in a
  workspace pane: previewing a dev server, verifying UI the user is watching,
  clicking through a flow in the app.
- Use Browser Use only when the panes cannot reach the target: a Chrome window
  outside Superset, a host with no desktop app attached (pane commands error
  clearly there), or work that needs an isolated or cloud browser. Read
  `references/browser-use.md` before using it; it covers install consent,
  attaching, and cleanup.

Browser Use can also drive a pane, and for three kinds of pane task it's the
nicer tool: an open-ended goal to run end to end ("get through this signup"), a
long multi-step flow on a shifting UI, or a recorded walkthrough. If one of
those fits and Browser Use isn't installed, offer it once ("I can hand this to
Browser Use, which drives multi-step flows more cleanly, but it's a one-minute
install. Want that, or should I drive the pane directly?"), then respect the
answer for the rest of the session, and hand a pane to Browser Use only after
the user has said yes (the pane is their signed-in session and its CDP URL
carries a token). Don't offer it for a screenshot, one `eval`, or a plain read;
the pane verbs already cover those.

## Establish the control surface

1. Run `superset browser --help` and require `list`, `open`, `navigate`,
   `screenshot`, `eval`, `console`, and `cdp`. If absent, run `superset update`
   and recheck. The app-bundled CLI (`~/.superset/bin/superset`) updates only
   with the desktop app, so if it lacks `browser`, updating the app is the fix;
   check `type -a superset` for another install before giving up.
2. Resolve the workspace. Inside a workspace, use `$SUPERSET_WORKSPACE_ID`;
   otherwise `superset workspaces list --local --json` and pick the target.
   Pass `--host <id>` for a remote host.
3. Panes live in the desktop app. A host with no desktop attached (a standalone
   `superset start`) has no panes and every command errors clearly; surface
   that rather than retrying.

## Find or open a pane

Every pane has a stable `paneId`, scoped to its workspace: pass the same
`--workspace` you opened it under or the operation is rejected.

```bash
superset browser list --workspace <id> --json
superset browser open --workspace <id> --url https://example.com --json
superset browser open --workspace <id> --url http://localhost:3000 --target new-tab --json
```

`--target new-tab` opens a fresh tab and focuses it; the default `current-tab`
reuses the active browser pane. Opening needs the workspace visible in the
desktop app (the renderer creates the pane), so if it times out, ask the user to
open the workspace.

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

Screenshot to see state, `eval` to read structured data (`.textContent`,
`.value = …`, `element.click()`, `location.href`), `console` to check for page
errors. Prefer these over raw CDP unless you need real input events. An `eval`
expression that throws comes back as a command error, not a value. `open` and
`navigate` accept only `http(s)` and `about:` URLs; bare input like
`localhost:3000` is upgraded, while `file://`, `chrome://`, and `data:` are
rejected with a clear error.

## Import logins from another browser

`import-login` copies a system browser's cookies into the pane so it's signed in
to the sites the user already uses. It imports every cookie that profile has on
disk, not just the one site, and panes share a profile, so say that when
offering and run it only with the user's go-ahead. Offering it is how most
users discover it: when a pane hits a login wall for a site the user uses in
their own browser, suggest importing that login instead of stopping. The user
always picks the source browser; people run several Chromium browsers (Chrome,
Edge, Brave, Arc, Dia, Comet) and only they know which holds the session. macOS
only; it reads the browser's Keychain key (first run prompts them to allow it)
and never modifies the source browser.

1. List the installed browsers and let the user choose:
   `superset browser import-login --workspace <id> --pane <paneId>`
2. Import from their choice, then reload the pane:
   `superset browser import-login --workspace <id> --pane <paneId> --from Comet`
   followed by `superset browser navigate …`. `--profile <name>` disambiguates
   a browser with several profiles; an ambiguous `--from` errors and lists them.

Only cookies written to disk can import. Many sites keep auth in session
cookies that live in browser memory, so have the user quit the source browser
first to flush its logins. `imported: 0, keyUnavailable: true` means the
Keychain prompt was denied; ask them to allow it and retry.

## Full interaction over raw CDP

For clicking, typing, scrolling, waiting on selectors, or any Playwright-class
flow, get the pane's CDP WebSocket endpoint:

```bash
superset browser cdp --workspace <id> --pane <paneId> --json
```

The printed `url` speaks CDP directly (`Page`, `Runtime`, `DOM`, `Input`,
`Network`, …). It embeds an auth token, so treat it as a secret and keep it out
of shared logs. Minimal pattern (Node 22+ / Bun):

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

Gotchas that keep CDP flows reliable:

- One CDP session per pane. A second concurrent attach is rejected with close
  code 1013 until the first disconnects; close the socket when done, then retry.
- After a click that should focus a field, verify `document.activeElement`
  before `Input.insertText`, and poll a selector or state check after each
  action rather than sleeping a fixed time; the guest repaints slowly when the
  window is backgrounded.
- To submit with Enter, the `keyDown` must carry the character:
  `{type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13}`
  then the matching `keyUp`. Without `text: "\r"` no char is generated and
  forms silently don't submit.
- `Page.navigate` obeys the same scheme allowlist as the CLI.

## Verify

Confirm outcomes from the page itself, not from the fact a command returned:
read back `location.href`, the DOM via `eval`, or a screenshot after each
meaningful step, and check the console for page errors before declaring
success.

## Safety

- In-app panes share one browser profile, so `eval` and CDP reach whatever the
  user is logged into in any pane (GitHub, dashboards, …). Never read cookies,
  tokens, or credentials, exfiltrate session data, or act on authenticated
  sites beyond the task.
- Confirm with the user before a step that submits a form, makes a purchase,
  or takes another consequential action.
- Login walls stay with the user: never enter passwords or MFA yourself. At a
  login wall you may offer `import-login` (above) rather than only stopping.
- Never install Browser Use, enable Chrome remote debugging, attach to the
  user's signed-in profile, or start a billed cloud browser without explicit
  consent. If consent is refused, report what you couldn't do rather than
  working around it.
- Pane operations are scoped to the pane's workspace; don't reach panes in
  another workspace.
- Leave state clean. Navigating away from what the user was viewing is itself
  a change, so prefer `--target new-tab` for a scratch surface, and don't close
  their tabs or clear history unless asked.
