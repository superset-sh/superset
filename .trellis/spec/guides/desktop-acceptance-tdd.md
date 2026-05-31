# Desktop Acceptance TDD

Use this guide when a task changes desktop user-visible behavior, authenticated entry, routing, workspace/task/agent flows, terminal or host runtime behavior, or any Electron main/preload/renderer boundary.

## Default Expectation

Desktop-facing requirements should define acceptance before implementation:

- Write the user-visible acceptance path in `prd.md`.
- Write the automation strategy in `design.md` or `implement.md`.
- Prefer adding the failing unit/source/integration check before changing behavior when the regression can be expressed cheaply.
- Use the project Desktop Automation CLI as the default real desktop acceptance tool when correctness depends on Electron startup, preload IPC, token persistence, route guards, host-service startup, terminal/websocket runtime, or multi-pane UI.
- Capture screenshots for smoke checkpoints and failures.

If a desktop-facing task does not run Desktop Automation CLI acceptance, the task's validation notes must explain why the risk is adequately covered by lower-level tests.

## Acceptance Pyramid

Use the cheapest reliable layer first, then add the real app layer when the behavior crosses runtime boundaries.

1. Unit or source regression tests for pure helpers, route wiring, guards, deleted code staying deleted, and fragile import boundaries.
2. Integration tests for tRPC routers, host-service, pty-daemon, database contracts, and process/session adoption.
3. Desktop Automation CLI acceptance for flows that only prove out when Electron main, preload, renderer, persisted state, and backend services run together.
4. Visual screenshot review for layout, blank-screen, wrong-surface, modal, or obvious product-state regressions.

Do not replace lower-level deterministic assertions with screenshot-only checks. Screenshots are evidence and debugging artifacts; selectors, URL/hash state, files, logs, and service probes are the primary gates.

## Desktop Automation CLI Quality Gate

The default tool for real desktop acceptance is `packages/desktop-mcp`, run through the repo-local `desktop:automation` Bun script.

Trellis quality gates are repo-local workflow steps and executable commands, not MCP plug-in slots. Use `bun run desktop:automation -- ...` in validation steps and slash commands so the gate does not depend on whether the current host exposes local MCP tools to the model. The MCP server can remain available as a compatibility surface, but Trellis gates should prefer the CLI.

Use it like this:

- Start the real desktop app with `bun run --cwd apps/desktop dev`; the script sets `DESKTOP_AUTOMATION_PORT=9322`.
- Use Desktop Automation CLI commands to inspect and drive the app: `window-info`, `inspect-dom`, `wait-for`, `click`, `type-text`, `send-keys`, `navigate`, `console-logs`, `evaluate-js`, and `screenshot`.
- Prefer `smoke` for Trellis gates, for example `bun run desktop:automation -- smoke --url-includes "#/sign-in" --screenshot .trellis/tasks/<task>/artifacts/01-sign-in.png --report .trellis/tasks/<task>/artifacts/01-sign-in.json`.
- Save screenshot artifacts under the task directory, for example `.trellis/tasks/<task>/artifacts/01-sign-in.png`.
- Record any CLI failures, console errors, report paths, and screenshot paths in validation notes.
- If Desktop Automation cannot control an OS-level surface, use Codex Desktop Computer Use as a fallback and record why the fallback was needed.

Do not add Playwright, WebDriver, or another desktop driver for routine Trellis acceptance unless a specific task needs CI-style fully scripted execution that Desktop Automation cannot provide.

## Real Desktop Acceptance Requirements

Real desktop acceptance should:

- Launch the actual Electron app from repository dev or compiled output.
- Use a disposable `SUPERSET_HOME_DIR` so the user's real token, app state, and window state are untouched.
- Refuse production API, Electric, relay, or database targets by default.
- Probe or start required local services explicitly.
- Assert stable route state, visible UI labels/roles, and persisted artifacts such as `auth-token.enc` when relevant.
- Capture screenshots at meaningful checkpoints and on failure.
- Record main-process and renderer console errors.
- Clean up Electron, child services, ports, temporary directories, and background processes best-effort in `finally`.

Computer Use fallback is allowed for native dialogs, app menus, full-screen transitions, OS permission prompts, or focus states outside the renderer/CDP boundary. It should not replace Desktop Automation CLI for normal renderer assertions.

## Non-Brittle Assertion Rules

Prefer stable contracts:

- URLs/hash routes that represent product state.
- Accessibility roles, labels, and visible headings.
- Explicit `data-testid` only when the UI has no semantic selector and the selector represents a stable product concept.
- Files or local state the feature is responsible for creating.
- API or service health probes.

Avoid brittle checks:

- Pixel-perfect full-page screenshots unless the task is specifically visual design QA.
- CSS class names from styling libraries.
- Deep DOM structure paths.
- Arbitrary sleeps without a readiness condition.
- Text that is likely to change for copy-only reasons unless the copy itself is the contract.

## Planning Checklist

For every desktop-facing Trellis task, planning should answer:

- What user path proves the feature works in the real desktop app?
- Which lower-level tests catch cheap regressions?
- Does the task need Desktop Automation CLI acceptance? If yes, which app startup command and CLI path prove it?
- Which CLI commands prove the path, and where should screenshot/report artifacts be saved?
- What screenshots should be captured for visual inspection?
- What services, env vars, accounts, ports, and temp state does the smoke need?
- What makes the smoke safe against production data and the user's real local profile?
- What would make the smoke flaky, and what readiness signal avoids that?
- Does any part require Computer Use fallback because CDP cannot reach it?

## Validation Notes

When finishing a desktop-facing task, record:

- The focused unit/source/integration tests that passed.
- The Desktop Automation CLI acceptance path and result, or the explicit reason it was not run.
- Screenshot artifact paths when the smoke captures them.
- Any Computer Use fallback steps, remaining manual visual checks, or known instability.
