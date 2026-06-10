# Design

## Product Model

Superset Code execution should use this mental model:

- Project is the cloud collaboration object.
- Host is the execution machine.
- Workspace/worktree is a host-local checkout or task execution directory.
- Task belongs to a Project and may create a task worktree on the selected Host.
- Guided workflow is a Plugin capability that can be injected into a worktree before Agent launch.

The Task run panel should not ask users to set up implementation details. It should ask where to run and with which Agent, then prepare the rest.

## Plugin Runtime Model

Introduce Trellis as the first concrete bundled Plugin Runtime:

- Runtime id: `trellis`
- Entrypoint: bundled `@mindfoldhq/trellis/bin/trellis.js`
- Runtime command: Bun preferred, Node fallback only where already supported
- Capabilities: project/worktree init, task bridge/status sync, agent workflow guidance
- Required gate: packaged startup and init smoke tests

Near-term implementation can keep the current `runtime-dependencies.ts` packaging list, but it must be treated as an implementation detail guarded by an executable smoke test. The architecture should make future extraction to `resources/plugins/<pluginId>` straightforward.

## Packaged Smoke Gate

Add a desktop script that can run in CI after packaging or against a packaged app path:

1. Locate the Trellis CLI in the packaged resources layout.
2. Execute `trellis --help` through the same runtime path the app will use.
3. Create temp git repositories and run:
   - `trellis init --yes --skip-existing --claude`
   - `trellis init --yes --skip-existing --codex`
4. Fail hard on missing packages, non-zero exit, or missing `.trellis/` output.

This gate must run before Canary artifacts are uploaded.

## Task Run Target Behavior

Replace the user-facing setup prerequisite with deterministic execution:

1. User selects host and agent.
2. If host offline, disable run and show an explicit offline message.
3. If host online, `Run task` remains the primary action.
4. On run:
   - ensure/create project checkout on selected host when needed;
   - create a task worktree on selected host;
   - inject guided workflow if enabled;
   - launch the selected Agent in that worktree;
   - sync Task status through the existing Trellis bridge.

The UI can show progress states such as `Preparing worktree`, `Installing guided workflow`, and `Starting Claude`, but should not require the user to understand Trellis setup.

## Error Taxonomy

Errors should map to product causes:

- `host_offline`
- `project_prepare_failed`
- `worktree_create_failed`
- `plugin_runtime_broken`
- `plugin_injection_failed`
- `agent_launch_failed`

The `supports-color` failure is `plugin_runtime_broken` and belongs in CI gates, not customer runtime.

## Constraints

- Do not touch production database or migrations for this task unless a later explicit approval is given.
- Preserve current V2 workspace schema semantics.
- Keep renderer free of Node filesystem inspection; host-service owns local project/worktree probing and mutation.
- Keep relay/host-service exposure defaults secure.
- Keep user-facing copy generic: "guided workflow", not "Trellis".
