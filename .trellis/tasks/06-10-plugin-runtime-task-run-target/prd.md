# Plugin Runtime and Task Run Target Simplification

## Goal

Treat Trellis as the first bundled Plugin Runtime with packaged smoke gates, and simplify task execution so the selected online host always creates/prepares the task worktree and injects guided workflow automatically.

## Requirements

- Trellis must be treated as Superset's first bundled Plugin Runtime, not as an incidental app dependency.
- Packaged Canary/Release builds must include a complete runnable Trellis runtime. Missing package errors such as `Cannot find package 'supports-color'` are Superset packaging failures and must be caught before release artifacts are uploaded.
- Add a packaging/runtime smoke gate that executes the bundled Trellis entrypoint after app packaging or against the packaged resource layout.
- The smoke gate must prove both basic startup and minimal project initialization for supported Code agents currently wired by the app (`claude`, `codex`).
- Task execution UI must stop exposing `Set up project on this device` as a user-facing prerequisite.
- Task execution should only block on selected host offline. If the selected host is online, running a task should create/prepare a task worktree on that host and inject guided workflow automatically when enabled.
- If the selected host has no local project checkout, the system should prepare it on that host when possible using the project clone URL/import metadata, then continue with worktree creation.
- User-facing copy should describe the feature as guided workflow / workflow best practice. Keep `Trellis` as implementation terminology in code and specs.
- Errors shown to users must be classified by product cause: host offline, clone/setup failed, worktree creation failed, plugin runtime broken, plugin injection failed, or agent launch failed.
- The fix must preserve existing V2 Project/Workspace/Host semantics: one Project can have workspaces/worktrees across multiple hosts; choosing a host chooses the execution location for this task.

## Acceptance Criteria

- [ ] Canary packaged app can execute the bundled Trellis CLI without missing dependency errors.
- [ ] A packaged/runtime smoke command fails the build if bundled Trellis cannot run `--help`.
- [ ] A packaged/runtime smoke command fails the build if bundled Trellis cannot run `init --yes --skip-existing --claude` in a temp git repo.
- [ ] A packaged/runtime smoke command fails the build if bundled Trellis cannot run `init --yes --skip-existing --codex` in a temp git repo.
- [ ] Trellis runtime packaging no longer relies on an obviously incomplete dependency list; any remaining explicit package list is validated by the smoke gate.
- [ ] Task detail/run controls show a clear enabled action for online hosts and an offline message for offline hosts.
- [ ] Running a Task on an online selected host creates/prepares a task worktree on that host and applies guided workflow automatically when enabled.
- [ ] The previous confusing `Set up project on this device` state is removed or replaced by a clear internal-progress/action state.
- [ ] Focused unit/source tests cover plugin runtime packaging configuration and Task run target behavior.
- [ ] Desktop-facing validation covers the create Task -> run on selected online host -> worktree/guided workflow path, or documents why a lower-level packaged runtime smoke is the stronger gate for the Trellis dependency issue.

## Notes

- User explicitly wants this as a foundational Plugin architecture decision because future integrations such as Figma MCP will follow a similar bundled/injected runtime model.
- Current root cause for the Canary failure: Trellis entrypoint is present under `app.asar.unpacked`, but its CLI dependency chain reaches `ora -> chalk -> supports-color`, and `supports-color` is missing from the packaged runtime.
