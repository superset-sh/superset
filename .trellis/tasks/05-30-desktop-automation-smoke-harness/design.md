# Desktop Automation CLI Quality Gate Design

## Architecture

Add a workspace package:

- `packages/desktop-mcp/src/bin.ts`: stdio MCP entrypoint.
- `packages/desktop-mcp/src/cli.ts`: repo-local CLI entrypoint for Trellis quality gates.
- `packages/desktop-mcp/src/automation/desktop-automation.ts`: shared CDP automation service used by CLI and future compatibility surfaces.
- `packages/desktop-mcp/src/mcp/connection/connection-manager.ts`: lazy CDP connection to the Electron renderer through `DESKTOP_AUTOMATION_PORT`.
- `packages/desktop-mcp/src/mcp/tools/*`: MCP tools for inspection, interaction, screenshots, console logs, navigation, and waits.
- `packages/desktop-mcp/README.md`: local usage and Trellis quality gate guidance.

The package is intentionally outside `apps/desktop` because it is an agent/tooling boundary, not product runtime code. It connects to a running desktop app but must not import Electron main or renderer modules.

## Automation Layer

Desktop Automation CLI is the primary real desktop acceptance layer. MCP remains a compatibility surface for hosts that expose local MCP tools directly, but Trellis gates should not depend on it.

It provides:

- `inspect-dom` before interaction, so agents can discover visible UI targets instead of guessing.
- `wait-for` for URL/text/selector/test-id readiness without arbitrary sleeps.
- `screenshot` for visual evidence, optionally saved under `.trellis/tasks/<task>/artifacts/*.png`.
- `console-logs` and `window-info` for non-visual debugging.
- `click`, `type-text`, `send-keys`, `navigate`, and `evaluate-js` for controlled interaction.
- `smoke` for Trellis gates, combining window info, readiness wait, DOM inspection, screenshot capture, console logs, and optional `.json` report output.

Do not add Playwright for routine Trellis acceptance. If future CI needs a fully scripted runner, create a separate task with a specific justification.

## Desktop Startup

`apps/desktop` should keep CDP development-only:

- `apps/desktop/src/lib/electron-app/factories/app/setup.ts` should append `remote-debugging-port` only when `NODE_ENV=development` and either `DESKTOP_AUTOMATION_PORT` or the legacy `RENDERER_REMOTE_DEBUG_PORT` is set.
- `apps/desktop/package.json` should set `DESKTOP_AUTOMATION_PORT=9322` in the `dev` script.
- `packages/desktop-mcp` should fail clearly when `DESKTOP_AUTOMATION_PORT` is missing.

## Platform Configuration

Codex:

- `.codex/config.toml` registers `desktop-automation` with command `bun run packages/desktop-mcp/src/bin.ts`.
- The MCP server env sets `DESKTOP_AUTOMATION_PORT=9322` to match desktop dev startup.

OpenCode:

- `opencode.json` registers the same local command.

Shared `.mcp.json` is currently gitignored as local/user config, so the tracked project config lives in the platform files above.

CLI:

- Root `package.json` registers `desktop:automation` with command `bun run packages/desktop-mcp/src/cli.ts`.
- Trellis slash command `.agents/commands/desktop-acceptance.md` calls the CLI, not MCP host tools.

## Trellis Quality Gate Flow

For a desktop-facing task:

1. Plan the real product path in `prd.md` and choose lower-level tests for cheap regressions.
2. Start the local desktop stack with `bun run --cwd apps/desktop dev` or the relevant desktop dev command.
3. Use Desktop Automation CLI:
   - Prefer `bun run desktop:automation -- smoke --url-includes "<route>" --screenshot <task-artifact>.png --report <task-artifact>.json`
   - Use single commands such as `window-info`, `inspect-dom`, `wait-for`, `click`, `type-text`, `send-keys`, `navigate`, `screenshot`, and `console-logs` for deeper validation.
4. Use Codex Desktop Computer Use only when CDP cannot reach OS-level UI.
5. Record commands, CLI observations, screenshot/report paths, and fallback reasons in validation notes.

## Safety

- CDP remains disabled in production by default.
- Desktop Automation connects lazily so commands can run after the app begins starting.
- Screenshot artifact writes must stay inside the repository workspace and end in `.png`; report writes must stay inside the workspace and end in `.json`.
- The automation package must not touch production databases or create accounts on its own; it only controls the running app.
- Agent flows that create accounts or write backend state must still follow the task's environment and production-safety rules.

## TDD Strategy

- Add focused Bun tests for screenshot artifact path safety and CLI argument parsing.
- Type-check the automation package.
- Keep lower-level desktop source tests for route/auth/paywall behavior in the parent task.
- Use the real Desktop Automation CLI gate as acceptance evidence once the app is running with local services.
