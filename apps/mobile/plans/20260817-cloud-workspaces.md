# Cloud workspaces on mobile — decision log

Goal: parity with the desktop cloud workspace experience (#6505, #6555, #6566)
in the iOS app. Read `docs/cloud-sandbox-mismatches.md` first.

## What desktop has today

- **List** — "Cloud" sidebar section above projects
  (`DashboardSidebarCloudSection`); rows carry name from the cloud row, branch
  from the sandbox, PR badge, agent status; provisioning rows spin with no
  menu; failed rows still listed; rename → `cloudWorkspace.rename`, delete →
  `cloudWorkspace.delete` (`useDestroyWorkspace`); gated by the
  `cloud-workspaces` flag and the API's `@superset.sh` check.
- **Create** — `DevicePicker` "Cloud" sentinel → project (local host's project
  list; ids are cloud `v2Projects` ids) → branch (GitHub remote branches via
  the local host's `gh`, `workspaceCreation.searchRemoteBranches`) → optional
  name, prompt (naming only, no agent launched) → `cloudWorkspace.create`
  returns the `provisioning` row, list seeded, navigate immediately.
- **Open** — `CloudWorkspaceProvisioningState` (two steps, elapsed timer, 45s
  "taking longer" hint), failed state with Remove; `list` polled at 1s while
  provisioning; `SandboxAccessProvider` mints access for every ready row and
  re-mints at 80% of the 10-minute TTL; HTTP carries
  `X-Blaxel-Preview-Token`, the WebSocket carries `bl_preview_token` in the
  query.

## Mobile facts that force decisions

- Home is scoped to one selected host (`useSelectedHost`) and grouped by
  project; the only host-service address builder is `buildRelayHostUrl`.
- The terminal WebSocket is a browser `WebSocket` inside the WKWebView
  (`scripts/generate-terminal-html.ts`); RN hands it a dial URL per attempt
  (`TerminalWebView.buildDialUrl`) after a relay-only `_whoowns` preflight.
- The composer's target is a (project, online host) pair
  (`useNewChatTargets`); there is no device chip.
- The composer's text launches an agent on host workspaces
  (`workspaces.create` with `agents`), which desktop cloud create does not do.
- No local host: desktop reads cloud-create projects and branches through it.
- iOS suspends JS timers in the background; nothing on mobile wires React
  Query to `AppState`.
- Desktop's `/terminal/<id>` dial (`useWorkspaceWsUrl`) carries no preview
  token — only `/events` does — yet terminals work there: the edge sets a
  `bl_preview_token` cookie on any authenticated request and Electron replays
  it on the upgrade. Mobile's WKWebView has its own cookie store, so it signs
  every dial explicitly (see the mismatches doc).

## Finding: `cloud_workspaces.project_id` points at a table that was already retired

- #6436 (2026-08-13) decoupled the app from cloud `v2_projects` and #6439
  shrank its surface "ahead of its removal"; `v2_workspaces.project_id` and
  `automations.v2_project_id` had their FKs dropped for that reason. Nothing
  writes `v2_projects` rows any more (`git log -S "insert(v2Projects)"`).
- #6505 (2026-08-16) added `cloud_workspaces.project_id` as a **cascade FK to
  `v2_projects`**, and `create`/`provision`/`repoForProject` all resolve the
  project there. Consequences: only projects with a legacy `v2_projects` row
  can be cloud-created (a project set up locally since the sync era has no row
  → "Project not found in this organization", though the desktop picker
  offers it); dropping `v2_projects` would cascade-delete every cloud
  workspace.
- What provisioning actually consumes from the project: repo coordinates
  (owner/name/defaultBranch → clone URL + App installation token) and a
  display name. That is a `github_repositories` row, already org-scoped and
  listable (`integration.github.listRepositories`), not a project.
- First proposal was repo-scoped (`github_repository_id`); superseded by the
  environments direction below.

## Direction (agreed 2026-08-17, not built here)

Model **environments**, not repos or projects: an org-scoped entity holding
0..n repos (one primary), setup commands, env var names, base image/version,
later a provider snapshot per version (SUPER-1892). `cloud_workspaces` then
references `environment_id` + branch of the primary repo. v1 of that entity
should enforce exactly one primary GitHub repo — host-service assumes one
workspace = one git root, and multi-repo/no-repo push into that. Until it
exists, `project_id` → `v2_projects` stays as the interim source of the repo,
fenced as such.

Clients must not orchestrate: create is one API call and the sandbox does the
rest. Follow-ups that fall out of that:

- The sandbox should launch the agent from the typed prompt itself
  (provision passes prompt + agent envs; host-service self-seed starts the
  session), for desktop and mobile alike.
- Attachments for sandboxes belong in blob storage, not written to the host,
  so a create can carry them before the sandbox exists.

## Decisions

| # | Decision | Choice |
| - | -------- | ------ |
| 1 | Interim create source | API procedures: `cloudWorkspace.listProjects` (v2_projects rows resolving to a repo, comment-fenced) + restored App-token `listBranches`; no host needed |
| 2 | Home placement | Cloud section pinned at the top, always visible (also in host-offline state), rows reuse `WorkspaceRow` |
| 3 | Create entry | One sectioned project sheet: Cloud section, separator, then per-online-host sections; chip reads "Project · Cloud" |
| 4 | Prompt after create | Feeds the auto-name only (parity); client stays dumb; sandbox-side agent launch is a follow-up for both apps |

Straight ports, no decision: per-URL credentials in the host-service client,
`useCloudWorkspaces` + `useSandboxAccess` (mint for every ready row, 80%
re-mint, re-mint on foreground if past expiry, mint-if-stale at dial),
`useWorkspaceHost` cloud branch, sandbox terminal dial with `bl_preview_token`
and no `_whoowns`, fan-outs over sandbox targets, provisioning + failed
screens, rename/delete routed to the cloud router, flag + API gate.

## PR A — verified on the simulator (2026-08-17)

Against this worktree's local API (8401) and two live Blaxel sandboxes, signed
in as an internal test account (`claude-mobile@superset.sh`, branch DB only):

- Cloud section on Home with the sandbox rows; a session mark on the one with
  a live terminal (terminal fan-out over sandbox targets works).
- Open → terminal WebView connects with `bl_preview_token` on the dial;
  composer → `terminal.send` (HTTP + preview header) → output streams back.
- New-session sheet lists the sandbox's agents; `agents.run` starts Claude in
  the sandbox (which then hits the root/skip-permissions refusal — see the
  mismatches doc; fixed in host-service + image, needs a rebuild).
- Provisioning row spinner + provisioning screen; failed row dot + failed
  screen; Remove from the failed screen deletes (after fixing the API's
  not-found classification in `deleteSandbox`).
- Rename from the actions sheet writes the cloud row; the workspace title and
  list read the cloud name.
- Actions sheet: project from the sandbox, Host "Cloud", Delete offered.

Not exercised: token refresh across a real background/foreground cycle (the
code path is `ensureSandboxAccess` at dial + invalidate on `AppState` active).
Setup traps hit: Metro `.worklets` ENOENT in a fresh worktree; local API's
GitHub App doesn't match the branch DB's installation, so create fails at the
token step here (that is what produced the failed row).

## PR B + image rebuild (2026-08-19)

- Sandbox image `superset-hostsvc` rebuilt from main and deployed. Verified
  end to end with a throwaway sandbox: `settings.agentConfigs.list` (which
  lazily seeds the builtin agents — anything calling `agents.run` cold must
  call it first) then `agents.run` with Claude boots the TUI under root with
  "bypass permissions on" and no dialogs. Probe sandbox deleted after.
- PR B implemented per the decisions: interim `cloudWorkspace.listProjects` +
  App-token `listBranches` (degrades to the default branch when the
  installation can't be authenticated — which is also the local-dev state,
  where the .env App doesn't match the branch DB's installations), sectioned
  project sheet, cloud branch source, agent chip hidden for cloud targets,
  one-call create → seed list → navigate.
- Verified locally over curl: listProjects returns the org's repo-bearing
  projects; listBranches returns `main` + degradation path.
