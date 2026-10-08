# Engine: Browser Use

[Browser Use](https://docs.browser-use.com/open-source/browser-use-cli) is a
CLI that executes Python against a browser over CDP: helpers are pre-imported
and a daemon manages the browser connection. Use it only per the routing in
SKILL.md: when the in-app panes cannot reach the target, or the user accepted
the offer for a delegated goal, a long multi-step flow, or a recording.

## Preflight

1. Check for an install: `command -v browser-use && browser-use --version`.
2. If missing, ask the user before installing anything (including `uv` itself).
   With authorization, install it so the bare `browser-use` command is on
   `PATH`:

   ```bash
   uv tool install browser-use
   browser-use --help
   ```

   `uvx --from 'browser-use[cli]' browser-use …` also works but is an ephemeral
   run that does not put `browser-use` on `PATH`, so every call must carry the
   full prefix. The bare invocations below assume `uv tool install`.

3. Read the engine's own instructions before driving: `browser-use skill`
   prints the upstream skill text with the current helper reference and
   workflow. Follow it for the details, except how to connect: ignore its
   `chrome://inspect` toggle and `mac-approve` steps and connect as below.
   `browser-use --doctor` diagnoses install, daemon, and browser-connection
   problems.

## Connect to a browser (consent first)

Never rely on the CLI's default attach: it targets a browser in
`chrome://inspect` toggle mode, where Chromium 144+ asks the user to "Allow
remote debugging?" for each new connection.

The user's own browser is their real, signed-in profile. Use it only with
explicit consent for this task; "use my browser/session" is consent, silence
is not. With consent, run it on a debug port, which never prompts, and point
Browser Use at it with `BU_CDP_URL`. Pick one port per browser and one
`BU_NAME`, and reuse both for every call:

```bash
curl -s http://127.0.0.1:9333/json/version || open -a "<App>" --args --remote-debugging-port=9333
export BU_CDP_URL=http://127.0.0.1:9333 BU_NAME=<app>
```

- If the browser already runs without that port (toggle mode or plain), the
  flag does nothing. Ask the user before you quit it
  (`osascript -e 'quit app "<App>"'`), then run the `open` line again. Its tabs
  return if it restores sessions.
- Google Chrome 136+ ignores the port on its own profile. Add
  `--user-data-dir=$HOME/.superset/browser-profiles/chrome` and open it with
  `open -na`: a separate agent profile that runs beside the user's Chrome. The
  user signs in there once.
- Arc hides its tabs from CDP and crashes when a client opens one. Do not
  drive it; use an in-app pane or another browser.
- The flag lasts until the browser quits. After a relaunch from the Dock, ask
  again before you restart it.

If the user declines the restart, connect once and hold that connection: set
`BU_CDP_WS=ws://127.0.0.1:<port><path>` from the two lines of
`~/Library/Application Support/<Browser>/DevToolsActivePort`. They approve
once, until the daemon stops. The first call waits only about 10 seconds for
Allow, so warn them first. On "timed out during opening handshake", ask them
to cancel the leftover dialog, then retry.

Never click Allow for the user (`mac-approve`, a GUI driver): the dialog is
their consent. Never drive their browser with a one-shot script per action
(`node x.mjs`, a fresh `websockets.connect`): each run brings the dialog back.

Without consent for their browser, use one of:

- A scratch browser you launch yourself (Chromium with a throwaway
  `--user-data-dir` and a debug port), pointed at via `BU_CDP_URL`.
- A Browser Use cloud browser: `browser-use auth login`, then
  `start_remote_daemon("<name>")` and prefix later calls with
  `BU_NAME=<name>`. Cloud browsers bill until stopped; ask before starting one
  and stop it when done.
- An in-app pane, when you specifically want Browser Use's harness against a
  workspace pane: export the pane's own CDP endpoint (the `url` from
  `superset browser cdp … --json`) as `BU_CDP_WS`, then run `browser-use`. The
  pane presents itself as a single page target, so Browser Use attaches to it
  directly. Do this only after the user accepted the Browser Use offer in
  SKILL.md; the pane is their signed-in session and the URL carries a token.

## Drive

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
and `click_at_xy(x, y)` clicks; prefer accessibility-tree targeting as the
upstream skill text describes. For MCP-capable hosts the same package also runs
as an MCP server: `uvx --from 'browser-use[cli]' browser-use --mcp`.

## Clean up

Stop any cloud daemon you started (`stop_remote_daemon("<name>")`; it bills
until stopped). Close tabs you opened in a browser you attached to, and leave
the user's own tabs, session, and browser settings as you found them. If you
launched a scratch browser, quit it and delete its throwaway profile.

The Verify and Safety sections of SKILL.md apply unchanged: confirm outcomes
from the page, never read credentials, confirm consequential actions, and
report refused consent rather than working around it.
