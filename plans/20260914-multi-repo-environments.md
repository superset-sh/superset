# Multi-repository environments

Status: decided and built 2026-09-14 on `sandbox-v2` (branch `sandbox-v2-multi-repo`), after
Satya asked for the environment-creation flow other platforms have: several repositories per
environment, one of them named as the source of the hooks, a personal or organization scope,
and an agent that onboards the checkout. Each call below was mine; overturn any of them.

## The model

- **An environment lists its repositories, in order.** `environment_repositories` rows, the
  first is the primary: the checkout a workspace opens on. The shared `Default` environment
  lists none and takes its repositories at workspace create, so anyone can start from the
  base image with any connected repository.
- **A workspace fixes its checkouts at create.** `cloud_workspace_repositories`: repository,
  branch, path. The environment's repositories if it has any, else the ones picked in the
  form. The primary gets the chosen branch; the rest their default branch. The box's
  checkouts, the firewall rule and the desktop's rows all follow from this and never drift.
- **One installation per workspace.** The firewall carries one header rule per host, so
  `github.com` gets one token, and an installation token spans repositories only within its
  installation (`repositoryNames` on the mint). The API refuses an environment or workspace
  that mixes installations.
- **The hooks repository.** `environments.hooks_repository_id` names which checkout's
  `.superset/config.json` the box acts on (the "config location" in the form); null means only
  the row's `hooks` override applies. The API reads that repository's config at create for
  `ports`; the box runs its `start` hook there.
- **Scope.** `environments.scope` is `organization` or `personal`; a personal environment is
  listed and usable by its creator alone (`created_by_user_id`). Promote copies the source
  environment's scope, hooks and repositories onto the golden's row.

## The box

- A lone repository is the workspace root, `/workspace`, as the reference machine had it;
  several sit under it at `/workspace/<name>` (the owner disambiguates a clash). The path is
  data on the workspace row (`.` for the root), so the runner, the seeding and the hooks read
  it rather than count. Decided with Satya 2026-09-14 over "always `/workspace/<name>`".
- **A promoted environment's repositories are fixed.** Its golden was cloned, set up and
  snapshotted for that set; a repository added later would be a bare clone with no setup, one
  removed would stay baked into every fork, and under the root layout a sibling would land
  inside the first checkout. `environment.update` refuses the change; the dialog shows the
  set read-only with "promote again to change". Image-backed environments (the shared
  `Default`, anything not yet promoted) change freely: every workspace on them clones fresh.
- The identity carries `SUPERSET_SANDBOX_REPOSITORIES` (JSON: url, branch, path, hooks flag)
  instead of one URL and branch. The boot runner checks each out, a marker per path under
  `/var/lib/superset/checkouts/`, and `checkout.ready` once all are in; a golden has the
  markers stripped so a fork fetches its branch into the checkouts it inherited.
- host-service seeds one project and one workspace row per repository. The primary's row
  carries the cloud workspace's id (the app opens on it, every fan-out keys on it); the others
  get ids derived from the workspace id and the path, so a restart seeds the same rows. The
  desktop shows them under the cloud workspace.
- The `start` hook runs in the hooks repository's checkout; the internal environment's dev
  stack scripts take their checkout as the cwd they are started in.

## The API

- `environment.create { name, repositoryIds[], hooksRepositoryId?, scope }`, `update` accepts
  the same; `list` and `get` return `repositories` and hide other people's personal rows.
- `cloudWorkspace.create` takes `repositoryIds[]` only for an environment without its own;
  `listBranches` takes a `repositoryId`; `repositories` lists every workspace's checkouts for
  the sidebar. The `repo` procedure and the hardcoded repository are gone.
- The release writes the internal environment's repository (the monorepo) and names it the
  hooks repository.

## The flow

The environment dialog: name, repositories (multi-select from the organization's GitHub
installation, with a refresh that resyncs it), config location (none or one of the chosen
repositories), scope, then "Skip and save" or "Start agent". "Start agent" saves the
environment and creates a cloud workspace on it with the onboarding prompt
(`ENVIRONMENT_ONBOARDING_PROMPT`): the agent installs what the project needs, writes
`.superset/config.json` hooks, and lists the secrets it lacks; the person watches in the
terminal and desktop, and promotes the result to a golden from the sidebar when it runs.

The new-workspace form: for an environment with repositories the pill names them; for one
without, a repository picker appears beside it. The base-branch pill, which the cloud form
used to hide, reads the primary repository's branches and its choice is the branch the box
checks out (mobile already sent one).

## Verified

2026-09-14 on the worktree dev stack: dialog create and edit over CDP; the form's repository
and branch pills on both kinds of environment; a real "Start agent" create on two public
repositories (box healthy 12.8 s after provisioning started, both checkouts under
`/workspace`, two projects seeded, the agent in the primary). boot-twice and runner-check on
the multi-repo runner. Records: the implementation checklist, PR 6.

## Not built

- A branch per non-primary repository at create (they take their default branch).
- Repositories from more than one GitHub installation in one workspace.
- A pane that opens a repository `port` through the gate; the ports are published, the mint
  still issues tickets for the platform's two.
