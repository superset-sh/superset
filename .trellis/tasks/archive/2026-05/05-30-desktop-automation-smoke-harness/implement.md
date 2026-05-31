# Desktop Automation CLI Quality Gate Implementation Plan

## Checklist

1. Remove the Playwright false start.
   - Delete the `apps/desktop/scripts/smoke-desktop*` files.
   - Remove the `smoke:desktop` script.
   - Remove the direct Playwright dependency added for this task.

2. Add Desktop Automation package.
   - Copy and adapt the fork's `packages/desktop-mcp`.
   - Pin dependencies to the repo's exact-version style.
   - Add `wait_for` for non-brittle readiness checks.
   - Add safe screenshot artifact saving.
   - Add a shared CDP automation service and repo-local CLI entrypoint.
   - Add `smoke` command for Trellis screenshot/report quality gates.

3. Wire desktop startup, CLI, and MCP compatibility config.
   - Set `DESKTOP_AUTOMATION_PORT=9322` in `apps/desktop` dev startup.
   - Add root `desktop:automation` script.
   - Register `desktop-automation` in `.codex/config.toml`.
   - Register `desktop-automation` in `opencode.json`.

4. Update Trellis specs.
   - Make `.trellis/spec/guides/desktop-acceptance-tdd.md` Desktop Automation CLI-first.
   - Add Computer Use fallback guidance.
   - Add `desktop-mcp` package specs.
   - Add `desktop-mcp` to `.trellis/config.yaml`.
   - Add `.agents/commands/desktop-acceptance.md` for slash-command usage.

5. Document usage.
   - Add `packages/desktop-mcp/README.md`.
   - Update `AGENTS.md` package list.

6. Validate.
   - Run package tests and type-check.
   - Run Trellis task validation.
   - Run lint/format checks after source edits.
   - If the real desktop app is not running, record that CLI/CDP acceptance was not exercised in this turn.

## Validation Commands

```bash
bun install
bun test packages/desktop-mcp
bun run --cwd packages/desktop-mcp typecheck
python3 ./.trellis/scripts/task.py validate 05-30-desktop-automation-smoke-harness
bun run lint:fix
bun run lint
bun run typecheck
git diff --check
```

Optional real app acceptance when local services are running:

```text
Start: bun run --cwd apps/desktop dev
CLI: bun run desktop:automation -- smoke --url-includes "<route>" --screenshot <task-artifact>.png --report <task-artifact>.json
Single-command path: window-info -> inspect-dom -> wait-for -> interact -> screenshot -> console-logs
```

## Risky Files / Rollback Points

- `packages/desktop-mcp`: new package and dependency surface.
- `apps/desktop/package.json`: dev env changes affect desktop startup; CDP remains development-only through existing main-process guard.
- `.codex/config.toml` and `opencode.json`: platform MCP config changes.
- `.trellis/spec/guides/desktop-acceptance-tdd.md`: quality gate convention; keep wording practical and tool-specific.
