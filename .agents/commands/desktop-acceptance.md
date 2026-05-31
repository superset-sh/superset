---
description: Run a Trellis desktop acceptance smoke through the repo-local Desktop Automation CLI
allowed-tools: Bash
---

Run a real Electron desktop acceptance smoke using the repo-local CLI, not host MCP tool bindings.

## Input

Parse `$ARGUMENTS` for:
- **Task directory** (optional): defaults to the active Trellis task when obvious.
- **Wait target** (optional): route/text/selector to prove readiness. Prefer `--url-includes`.
- **Screenshot name** (optional): defaults to `desktop-smoke.png`.

## Steps

1. Start the desktop app in a separate terminal/session with a disposable profile:

```bash
SUPERSET_HOME_DIR=$(mktemp -d -t superset-desktop-smoke-XXXXXX) bun run --cwd apps/desktop dev
```

2. Wait for the app to print `DevTools listening on ws://127.0.0.1:9322/...`.

3. Run the CLI smoke:

```bash
bun run desktop:automation -- smoke \
  --url-includes "#/sign-in" \
  --screenshot .trellis/tasks/<task>/artifacts/desktop-smoke.png \
  --report .trellis/tasks/<task>/artifacts/desktop-smoke.json
```

4. Record the command, URL/DOM result, console summary, screenshot path, and report path in the task validation notes.

5. Stop the desktop app and remove the disposable `SUPERSET_HOME_DIR`.

## Notes

- Use `bun run desktop:automation -- help` for all available subcommands.
- Use Computer Use only for native dialogs, menus, fullscreen/focus, or permission prompts outside CDP.
- Do not add Playwright/WebDriver for this smoke unless a task explicitly requires a separate CI runner.

$ARGUMENTS
