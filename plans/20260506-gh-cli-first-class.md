# gh CLI first-class for GitHub access

## Why

`workspaceCreation.searchPullRequests` (and `searchGitHubIssues`) throw `BAD_REQUEST: Project has no linked GitHub repository` when the cloud project's `githubRepositoryId` is NULL. The `github_repositories` row only exists if the GitHub App was installed for the org at project-create time, so any project created outside that path is broken. v1 dodged this entirely by shelling to `gh` against the local repo.

Goal: make `gh` first-class, parsed `repoCloneUrl` as the owner/name fallback, and drop the cloud-side dep.

## Scope (this PR)

1. `execGh` becomes injectable on `CreateAppOptions` (parallels `github` factory) so the gh path is testable.
2. `resolveGithubRepo` returns `{ owner, name, repoPath? }`, sourcing owner/name from cloud `repoCloneUrl` (parsed) instead of the `github_repositories` join. Looks up local `projects.repoPath` by `projectId` for first-class `gh`.
3. `searchPullRequests` + `searchGitHubIssues`: gh first-class (`cwd: repoPath`) when `repoPath` and `gh` are available; Octokit fallback otherwise. Same response shape.
4. Tests: existing repro tests go green via Octokit fallback. Add a first-class-path test that injects a fake `execGh` and asserts `gh pr list --search …` is invoked with `cwd=<repoPath>`.

## Out of scope (follow-up PRs)

- Migrate `getPullRequestThreads`, the pull-requests runtime poller, `mergePR` to gh.
- Delete the 7 unused `github.*` endpoints (`getPRStatus`/`getPR`/`listPRs`/`getRepo`/`listDeployments`/`listDeploymentStatuses`/`getUser`).
- Remove `Octokit` factory + `@octokit/rest` dep once nothing references it.

## Smoke test

1. Repro with a project whose cloud `githubRepositoryId` is NULL — search PR errors today.
2. After fix: search returns results.
3. Move `gh` aside (`mv $(which gh) /tmp/gh.bak`) → fallback still works (Octokit).
4. Project with linked `githubRepository` keeps working.
