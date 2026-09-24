# P1-C — VERIFY (read-only pass against `main`)

Repo: superset-sh/superset · Branch under review: `superset/p1-c-lifecycle-cmd-injection-42692c4e`
Base commit: `65da26d`

## 0. Blocker: advisory bodies could not be fetched

    $ gh api repos/superset-sh/superset/security-advisories/GHSA-h3q4-r3jv-gmj2 --jq .description
    {"message":"Resource not accessible by integration", ... "status":"403"}
    $ gh api repos/superset-sh/superset/security-advisories
    []

The session token (`superset-app[bot]`) lacks the repository-security-advisories read scope, and the
list endpoint returns empty. **The advisory prose was never read.** Everything below is verified
against the code from the two advisory titles given in the task. If the advisories describe a
different sink than the one found here, this verification does not cover it.

## 1. Where lifecycle commands come from

One resolver feeds every lifecycle sink: `loadSetupConfig()` in
`apps/desktop/src/lib/trpc/routers/workspaces/utils/setup.ts:182`. It merges four sources; later
wins (`mergeBaseConfigs` uses `override.X ?? base.X`, setup.ts:130-135):

| # | Source | Path | Tracked in git? | Who controls it |
|---|--------|------|-----------------|-----------------|
| 1 | main repo | `<mainRepoPath>/.superset/config.json` | **yes** | project's default branch |
| 2 | worktree  | `<worktreePath>/.superset/config.json` | **yes** | **whatever branch the workspace is on** |
| 3 | user      | `~/.superset/projects/<projectId>/config.json` | no | local user |
| 4 | local     | `<repo>/.superset/config.local.json` | no (gitignored) | local user |

`.gitignore` confirms `config.json` is tracked and only the `.local.json` overlay is ignored:

    # Superset (track scripts/config; ignore generated workspace artifacts)
    .superset/ports.json
    .superset/config.local.json

Source **2 is the attack surface**: it is ordinary branch content, and it overrides source 1.
`copySupersetConfigToWorktree` (setup.ts:17-33) only copies the main-repo `.superset` into the
worktree **if the worktree has none** — so a branch that ships its own `.superset/` keeps it intact.

## 2. Claim: attacker-controlled **teardown** executes on workspace deletion — **CONFIRMED**

`apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.ts:32-71`:

```ts
const config = loadSetupConfig({ mainRepoPath, worktreePath, projectId });
...
const command = config.teardown.join(" && ");
...
const child = spawn(shell, args, {
    cwd: worktreePath,
    detached: true,
```

Reached with no confirmation from `procedures/delete.ts:222` (workspace delete) and
`procedures/delete.ts:520` (worktree delete). Runs as the desktop app's own user, with the user's
login shell and `$SHELL` wrappers — i.e. **full victim privileges**. No allowlist, no trust check,
no prompt.

## 3. Claim: attacker-controlled **setup** command injection — **CONFIRMED**

Every workspace-open path returns `initialCommands: setupConfig?.setup` to the renderer —
`create.ts:304,427,618,719,949`, `init.ts:218`, `workspace-creation.ts:269,509,585`. The renderer
joins and types them into a live PTY with a trailing newline, unprompted:

- `renderer/lib/terminal/launch-command.ts:50-54` — `return commands.join(" && ");`
- `renderer/react-query/workspaces/bootstrap-open-worktree.ts:36-62`
- `renderer/screens/main/components/WorkspaceInitEffects.tsx:135-190`

`useCreateFromPr.ts:45-52` queues exactly this for a workspace created from **someone else's pull
request** — the branch is the attacker's, and the setup commands run on open.

## 4. Two further sinks on the same resolver (not named in the advisories, same defect)

- **`run`** — `procedures/query.ts:78` `configRunCommands: config?.run` → executed via
  `useWorkspaceRunCommand.ts:125` / `useV2WorkspaceRun.ts:172`.
- **`cwd`** — `procedures/query.ts:79` `configCwd: config?.cwd` → becomes the run terminal's
  `initialCwd` (`shared/workspace-run-definition.ts:99`, `useWorkspaceRunCommand.ts:135`).

Both are branch-controllable by the same path, so the fix covers them.

## 5. On "injection" / escaping

`config.teardown.join(" && ")` and `commands.join(" && ")` are **not** classic injection sinks: each
array entry is by design a shell command line, so there is no metacharacter to escape — quoting them
would break every legitimate config. The defect is **provenance**, not escaping: untrusted branch
content is accepted as an authoritative source of commands. The fix therefore gates *who may set*
lifecycle commands rather than trying to sanitise them.

## 6. Verdicts

| Advisory | Claim | Verdict |
|---|---|---|
| GHSA-hf7c-jmhj-qghw | attacker-controlled teardown executes on workspace deletion | **CONFIRMED** |
| GHSA-h3q4-r3jv-gmj2 | attacker-controlled setup command injection | **CONFIRMED** (provenance, not escaping — §5) |

Exploit run against unmodified `main`: `evidence/before-exploit.txt` (both PoCs succeed; the teardown
PoC really creates its marker file via `spawn`).

## 7. Residual risk the fix does NOT close (stated, not skipped)

Demoting the worktree source stops an untrusted branch from **declaring** commands. It does not stop
a *trusted* command from **executing branch content**: the documented pattern is
`"setup": ["./.superset/setup.sh"]` (setup.ts:14-16) and lifecycle commands run with
`cwd: worktreePath`, so a PR branch that rewrites `setup.sh` still gets code execution on a victim
who already had that command configured. Closing that requires user consent before running lifecycle
commands in a workspace whose branch content is untrusted — a UI change, out of scope here and
recorded in `evidence/residual-risk.md`.
