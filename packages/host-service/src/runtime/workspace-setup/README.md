# Workspace setup

New host-service worktrees follow one sequence: resolve and refresh the base,
create the worktree, link selected ignored files, run setup, then launch requested
agents and commands. The desktop's creation presets wait for the same setup state.
Attaching an existing checkout does not rerun setup. Reopening a workspace with
unfinished setup does not dispatch additional agents.

Project defaults and file selections live in the execution host's SQLite project
row. Setup commands continue to use the existing lifecycle configuration resolver,
including repository config, worktree overrides, local overlays, and setup.sh.
Accepting a detected command uses the existing config editor; detection never
executes a command. A supported packageManager declaration takes precedence over
lockfiles; ambiguous lockfile families produce no suggestion.

Remote bases use a targeted fetch refspec and new branches pin the resulting SHA.
The root checkout and local base branches are not advanced. A fully qualified
`refs/heads/...` base explicitly selects local state. `refs/remotes/...` and
remote-qualified bases select the remote. Unqualified local branches with an
upstream retain the previous upstream-resolution behavior. Fetch failures are
errors, including when a cached ref exists. The desktop offers a one-time
`cachedBase: {ref, commit}` override and displays the cached commit's timestamp
(the commit date, not a claim about when the remote was last fetched). The host
validates that the cached ref still points to that SHA. Setup state records the
selected ref, SHA, and whether that explicit override was used.

Shared files are real symlinks on every platform. Sources must be ignored,
untracked regular files within the root checkout. Paths containing traversal,
.git, or node_modules are rejected. Existing destination files and symlinked
parent directories are never overwritten or followed. Missing files stop setup;
retry reuses the worktree, while skip applies only to that workspace.

`workspace_setup_runs` stores readiness and pending launches. Setup runs in a
visible terminal through a host-owned Bash wrapper. The wrapper writes an atomic
exit-code marker under the host database directory; the host launches agents only
on success. Command failures retain the terminal and worktree. Retry resolves the
current setup configuration and uses the existing worktree and links. Completed
runner files are removed. Host restart resumes monitoring running setup; an
interrupted linking or dispatch step requires review and retry, avoiding silent
duplicate agent launches.

The `workspaceSetup` router exposes `getProject`, `updateProject`, `status`, and
`retry`. Status excludes queued prompts and the initiating user's ID. The existing
`workspaces.create` and `createEnqueued` paths enforce the same lifecycle for all
clients. `waitForSetupBeforeAgents` remains accepted for older clients, but modern
hosts always wait. `runSetup: false` skips the command; file selections still apply
to a newly created worktree.
