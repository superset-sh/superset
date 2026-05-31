# Quality Guidelines

## Required Checks

- Run `bun test packages/desktop-mcp` for helper tests.
- Run `bun run --cwd packages/desktop-mcp typecheck` for CLI and MCP type safety.
- Run root `bun run lint` before pushing changes that touch this package.

## Review Checklist

- CLI command names and MCP tool descriptions should guide agents toward `inspect-dom` / `inspect_dom` or `screenshot` / `take_screenshot` before interaction.
- CLI commands and MCP tools should return actionable errors instead of raw protocol failures when an expected UI target is absent.
- Screenshot file writes must stay inside the repository workspace and use `.png` paths.
- CDP exposure remains development-only in the desktop app; production builds must not enable a remote debugging port by default.
- Trellis desktop acceptance should use the Desktop Automation CLI first. Codex Desktop Computer Use is a fallback for native dialogs, full-screen OS state, app menus, or focus issues that CDP cannot control.

## Scenario: Desktop Automation CDP Acceptance

### 1. Scope / Trigger

- Trigger: adding or changing `packages/desktop-mcp`, desktop CDP env wiring, CLI commands, MCP compatibility tool signatures, or Trellis desktop acceptance gates.
- Scope: local developer/agent automation only. This package controls a running desktop app; it is not product runtime code.

### 2. Signatures

- MCP command: `bun run packages/desktop-mcp/src/bin.ts`
- Root convenience command: `bun run mcp:desktop`
- CLI command: `bun run desktop:automation -- <command>`
- CLI smoke command: `bun run desktop:automation -- smoke --url-includes "#/sign-in" --screenshot .trellis/tasks/<task>/artifacts/sign-in.png --report .trellis/tasks/<task>/artifacts/sign-in.json`
- Desktop dev command: `bun run --cwd apps/desktop dev`
- MCP server name in platform config: `desktop-automation`
- Package typecheck: `bun run --cwd packages/desktop-mcp typecheck`
- Package tests: `bun test packages/desktop-mcp`

### 3. Contracts

- `DESKTOP_AUTOMATION_PORT`: preferred development-only CDP port consumed by `packages/desktop-mcp`.
- `RENDERER_REMOTE_DEBUG_PORT`: legacy fallback accepted by Electron main-process setup only for compatibility.
- Electron main must append `remote-debugging-port` only when `NODE_ENV=development` and one of the CDP env keys is set.
- Desktop Automation must connect lazily on first CLI command or MCP tool call, so the command can be invoked after the desktop app begins starting.
- `take_screenshot.path` must be a workspace-contained `.png` path.
- CLI `screenshot --path` / `smoke --screenshot` must be a workspace-contained `.png` path.
- CLI `smoke --report` must be a workspace-contained `.json` path.
- CLI `navigate --path /some-route` must normalize the path, update the desktop app's persistent `router-history` localStorage state, and reload the renderer so the browser hash and TanStack Router state agree.
- The app page target is any CDP page whose URL starts with `http://localhost:`, `http://127.0.0.1:`, or `file://`.

### 4. Validation & Error Matrix

- Missing `DESKTOP_AUTOMATION_PORT` -> Desktop Automation returns a clear "CDP is only enabled in development" error.
- Desktop app not running -> CDP connection fails against `127.0.0.1:<port>`; validation should record the missing app rather than invent selectors.
- No app page found -> error must include the CDP pages that were found.
- Screenshot path outside workspace -> throw before writing.
- Non-`.png` screenshot path -> throw before writing.
- Direct route acceptance -> use `navigate --path` and assert visible route content after reload; URL/hash presence alone is not enough.
- OS/native dialog blocks progress -> record Computer Use fallback reason.

### 5. Good/Base/Bad Cases

- Good: start desktop dev, run `bun run desktop:automation -- smoke ...`; record screenshot and report paths in the task validation.
- Good: use `bun run desktop:automation -- navigate --path /tasks`, then assert the Tasks surface is visible with `wait-for`, `inspect-dom`, or `evaluate-js`.
- Base: package tests/typecheck pass, and CDP `/json/version` is reachable after app startup.
- Bad: adding Playwright/WebDriver for routine Trellis acceptance, relying on CSS class chains, setting `window.location.hash` directly in `evaluate-js` for route acceptance, or enabling CDP in production.

### 6. Tests Required

- Unit test screenshot path safety (`inside workspace`, `outside workspace`, `non-png`) and CLI argument parsing when commands change.
- Typecheck all CLI commands and MCP compatibility registrations after adding tools.
- For desktop-facing feature tasks, run the real app and use Desktop Automation CLI unless the task explains why lower-level checks are enough.

### 7. Wrong vs Correct

#### Wrong

```bash
bunx playwright install
bun run --cwd apps/desktop smoke:desktop
```

#### Correct

```bash
bun run --cwd apps/desktop dev
bun run desktop:automation -- smoke \
  --url-includes "#/sign-in" \
  --screenshot .trellis/tasks/<task>/artifacts/sign-in.png \
  --report .trellis/tasks/<task>/artifacts/sign-in.json
```

#### Wrong

```bash
bun run desktop:automation -- evaluate-js --code 'window.location.hash = "#/tasks"'
```

#### Correct

```bash
bun run desktop:automation -- navigate --path /tasks
bun run desktop:automation -- wait-for --text "Tasks & PRs"
```
