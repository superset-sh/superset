# Desktop automation CLI quality gate

## Goal

Make the forked Desktop MCP approach a repo-local Desktop Automation CLI for real Electron desktop acceptance. Future desktop-facing Trellis tasks should use `bun run desktop:automation -- ...` for real app startup validation, DOM inspection, screenshots, input, route checks, console review, and JSON reports instead of depending on host MCP tool bindings or adding a separate Playwright desktop harness.

This is the follow-up child task for `05-30-v2-only-no-login-task-paywall`.

## User Value

- Agents can validate the actual desktop app surface after large refactors without inventing a new automation stack.
- Desktop acceptance becomes visible inside Trellis planning and quality gates.
- Screenshots can be captured into task artifacts for model or human visual review.
- Normal renderer UI flows use deterministic CLI commands; Codex Desktop Computer Use remains available only for OS-level fallback cases.

## Confirmed Facts

- The fork `TwitterIsGood/superset` contains `packages/desktop-mcp`, a local MCP server that connects to Electron CDP with `puppeteer-core`.
- The fork's automation tools cover screenshot capture, DOM inspection, click, typing, key presses, console logs, JS evaluation, navigation, and window info.
- The desktop app previously supported a development-only CDP switch through `RENDERER_REMOTE_DEBUG_PORT`, but Desktop Automation uses the clearer `DESKTOP_AUTOMATION_PORT` name.
- The current desktop `dev` script did not set a desktop automation port before this task.
- The first implementation briefly added a Playwright smoke harness, but the user clarified that Desktop Automation should be the Trellis gate tool and that Playwright should not be added for this purpose.
- Codex Desktop settings can recognize local MCP servers without exposing those MCP tools to the current model tool surface, so Trellis gates must not rely on host MCP bindings.
- Desktop acceptance still needs non-brittle checks: route/hash state, visible labels/roles/text, console logs, saved screenshots, and lower-level unit/source tests where cheap.

## Requirements

- Add `packages/desktop-mcp` as a repo-local Bun workspace package.
- Keep the automation package local; do not install it globally.
- Add a repo-local Desktop Automation CLI and root `desktop:automation` script.
- Configure Codex and OpenCode to expose the MCP server as `desktop-automation`.
- Make `apps/desktop` development startup enable `DESKTOP_AUTOMATION_PORT=9322` by default.
- Update Electron main-process setup to read `DESKTOP_AUTOMATION_PORT`, while keeping `RENDERER_REMOTE_DEBUG_PORT` as a compatibility fallback.
- Document the Desktop Automation CLI and how Trellis quality gates should use it.
- Update `.trellis/spec/guides/desktop-acceptance-tdd.md` so Desktop Automation CLI is the default real desktop acceptance tool.
- Include Codex Desktop Computer Use as a documented fallback for OS-level surfaces that CDP cannot operate, such as native dialogs, app menus, fullscreen state, permission prompts, or focus issues.
- Remove the Playwright smoke harness and dependency added during the earlier false start.
- Add focused source tests for Desktop Automation safety/helper behavior.
- Preserve production safety: CDP must remain development-only, and screenshots/reports written by automation must stay inside the repository workspace.

## Acceptance Criteria

- [x] `packages/desktop-mcp` exists and exposes a local MCP server entrypoint.
- [x] `packages/desktop-mcp` exposes a repo-local CLI entrypoint and root `desktop:automation` script.
- [x] The MCP server registers tools for screenshot, DOM inspection, wait/assert readiness, click, type, keypress, console logs, JS eval, navigation, and window info.
- [x] The CLI exposes equivalent commands plus a Trellis-friendly `smoke` command with screenshot/report output.
- [x] `take_screenshot` can save a `.png` artifact inside the workspace and rejects paths outside the workspace.
- [x] `apps/desktop` dev startup sets `DESKTOP_AUTOMATION_PORT=9322`.
- [x] Electron main-process setup opens CDP from `DESKTOP_AUTOMATION_PORT` in development and keeps `RENDERER_REMOTE_DEBUG_PORT` fallback support.
- [x] `.codex/config.toml` has a `desktop-automation` MCP server entry.
- [x] `opencode.json` mirrors the `desktop-automation` MCP server entry.
- [x] `.trellis/spec/guides/desktop-acceptance-tdd.md` names Desktop Automation CLI as the default desktop quality gate tool and Computer Use as fallback.
- [x] The earlier Playwright smoke script and direct Playwright dependency are removed.
- [x] Validation includes `bun test packages/desktop-mcp`, `bun run --cwd packages/desktop-mcp typecheck`, and relevant root quality checks.
- [x] Real desktop startup opens CDP on `127.0.0.1:9322` and the Desktop MCP connection layer can resolve the app page.

## Out Of Scope

- Full Chat / Code / Work product split.
- Full A2A or multi-agent collaboration E2E.
- Running real AI agent sessions to completion.
- Cross-machine account sync validation.
- Terminal persistence/tmux/pty-daemon restart validation.
- Production database writes or production account creation.
- A separate Playwright/WebDriver desktop harness.

## Open Questions

- None blocking. Desktop Automation CLI is the chosen quality gate tool; MCP is compatibility and Computer Use is a fallback, not the primary desktop acceptance path.
