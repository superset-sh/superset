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
   workflow. Follow it for the details; this file covers only routing, consent,
   and cleanup. `browser-use --doctor` diagnoses install, daemon, and
   browser-connection problems.

## Connect to a browser (consent first)

By default the CLI attaches to the user's running Chrome/Chromium over CDP,
which is their real, signed-in profile, and if Chrome lacks remote debugging it
prompts to enable it. Never take that path without the user's explicit consent
for this task; "use my browser/session" from the user is consent, silence is
not. Without it, use one of:

- A scratch browser you launch yourself (Chromium with a throwaway
  `--user-data-dir` and a debug port), pointed at via the `BU_CDP_URL` or
  `BU_CDP_WS` environment variables.
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
