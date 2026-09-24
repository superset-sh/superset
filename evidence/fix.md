# P1-D — Fix: GitHub repository entitlement gate

**Task:** P1-D · **Branch:** `superset/p1-d-github-member-authz-verify-b942a4de`
**Tickets:** SUPER-2432 (the reported boundary), SUPER-2022 (the design question this leaves open)
**Verdict being fixed:** CONFIRMED — see `evidence/verify.md`.

## What was wrong

Org membership was the *whole* authorization on the GitHub surface. The installation is often on
the owner's **personal** account (`accountType: "User"`), the sync records their private
repositories against the organization, and every read path then answered "are you in the org".

## The shape of the fix

One guard, `packages/trpc/src/lib/github-user/reachable-repositories.ts`, answering a single
question — *which of this organization's synced repositories may this caller read?*

```
public repository                          -> allowed (no boundary to enforce)
caller connected the installation          -> allowed (its contents are theirs by construction)
GitHub shows it to the caller's own account -> allowed
anything else — no connection, no OAuth
client, GitHub refused                     -> DENIED
```

Reachability is one call to `GET /user/installations/{id}/repositories` with the caller's own
user-to-server token: GitHub computes the intersection of the installation's repositories and that
account's access itself, so this is one request per person rather than a permission probe per
repository. Cached 60s per (person, installation).

**Why `connectedByUserId` is an entitlement and not a hole.** Installing the App does *not* create a
`githubUserConnections` row — they are separate OAuth flows. Without this arm, the owner who
connected the installation would need a second, separate connection to keep seeing their own
repositories, and the fix would break the exact person it protects. The column already existed and
was never read; this is the first thing that reads it.

Two entry points so a new caller is safe by default:
- `reachableRepositories({userId, organizationId, repositories})` — filter, for listings.
- `assertRepositoriesReachable({...})` — refuse with `FORBIDDEN`, naming the repositories, for the
  paths that act on a named set where silently dropping a row would half-configure something.

## Doors closed

| Door | File | Was | Now |
|---|---|---|---|
| Repository listing (feeds every GitHub query procedure) | `router/integration/github/trigger-options.ts:17` | all rows of the installation | `listGithubRepositories(orgId, userId)` filters through the gate |
| Trigger-option collaborators of a user installation | `router/integration/github/trigger-options.ts:105` | collaborators of every synced repo | only reachable repos |
| `listPullRequests` | `router/integration/github/github.ts:120` | repos by `installationId` | reachable repo ids |
| `listOrganizationPullRequests` | `github.ts:161` | every PR of the org | `inArray` reachable repo ids |
| `getByBranches` | `github.ts:211` | repos by `installationId` | reachable repos |
| `getStats` | `github.ts:319` | repos by `installationId` | reachable repos |
| Environment / branch-listing checkout resolution | `lib/sandbox/repositories.ts:70` | org match only | `loadRepositories` takes `userId` and asserts |
| **Cloud workspace create** | `router/cloud-workspace/cloud-workspace.ts:276` | `if (githubToken) {...}` — **skipped entirely** for an unconnected caller | unconditional `assertRepositoriesReachable` |
| **Ticket mint (`access` / `hostTicket`)** | `cloud-workspace.ts:137` `loadReadyWorkspace` | membership only | asserts against the workspace's actual checkouts |
| Workspace repository listing | `cloud-workspace.ts:141` | every checkout's `fullName` | filtered |
| Environment listing (`list` / `get`) | `router/environment/environment.ts:89` | every environment's repo names | filtered |
| `environment.promote` | `environment.ts` | membership only | asserts on the source's checkouts |

## Deliberate consequences (state these, don't discover them later)

1. **Members with no GitHub connection now see an empty private-repo list** where they saw the
   owner's full inventory. That is the correct behaviour and the point of the fix, but it is a
   visible product change — the onboarding nudge ("Connect GitHub to see private repositories")
   is the SUPER-2022 design question and is **not** built here.
2. **No creator bypass on the ticket mint.** Someone who created a workspace over a repository they
   cannot reach — which was possible before this fix — loses access to that box. That is
   remediation of the existing leak, not a regression, and it is why the check is on the checkout
   rather than on `createdByUserId`.
3. **A deployment without `GH_APP_CLIENT_ID`/`GH_APP_CLIENT_SECRET` cannot prove reachability for
   anyone**, so only the installation's connector sees private repositories there. Fail-closed is
   the intended direction; it is called out because it is a config-dependent behaviour change.
4. **Up to 60s of staleness** on a GitHub grant or revocation, from the reachability cache.

## No door was skipped

Every door named in `evidence/verify.md` is guarded. The three procedures deliberately left on plain
membership are `getInstallation` (installation metadata, no repository contents), `triggerSync`
(re-syncs, exposes nothing), and `cloudWorkspace.list` / `rename` / `delete` (addressing and
lifecycle, not reading a checkout — an admin must still be able to clean up a box whose repository
they cannot read).

## Proof

`evidence/test-before.txt` — fix reverted at the doors via `git stash`, tests untouched:

```
 4 pass
 4 fail
```

with the vulnerability printed literally:

```
error: expect(received).not.toContain(expected)
Expected to not contain: "hugo/private-notes"
Received: [ "acme/billing", "acme/website", "hugo/private-notes" ]
  at src/router/integration/github/trigger-options.test.ts:48
```

and the checkout door open:

```
error: expect(received).toBe(expected)
Expected: "FORBIDDEN"
Received: undefined
  at src/lib/sandbox/repositories.test.ts:61
```

The 4 that pass in the before-run are the *legitimate access* directions (owner, public repo,
genuine collaborator) — they pass in both runs, which is the point: the fix denies without
collateral.

`evidence/test-after.txt` — same tests, fix applied: **20 pass, 0 fail.**

## Tests (co-located)

- `packages/trpc/src/lib/github-user/reachable-repositories.test.ts` — the guard's contract in both
  directions: unconnected member denied, member GitHub refuses denied, genuine collaborator
  allowed, installation connector allowed with no GitHub call, GitHub 403 denies rather than
  admits, one call per person not per repository, empty set, no installation.
- `packages/trpc/src/lib/sandbox/repositories.test.ts` — the checkout door.
- `packages/trpc/src/router/integration/github/trigger-options.test.ts` — the listing door.
- `packages/trpc/test/github-authz-fixtures.ts` — the shared cast (owner / member / collaborator,
  one private personal repo, one shared private repo, one public repo).

## Checks

| Check | Result |
|---|---|
| `bun run typecheck` (monorepo, `--concurrency=1`) | **42/42 tasks pass, exit 0** |
| `bunx biome check` (trpc + server-errors) | clean |
| `bun run check:i18n` | pass — new message translated into all 16 non-English locales, `compile --strict` green |
| `bun test` (`@superset/trpc`) before | 368 pass / **5 fail** |
| `bun test` (`@superset/trpc`) after | 388 pass / **5 fail** |

The **5 failures are pre-existing** and unrelated: `deriveSandboxCredentials` in
`lib/sandbox/credentials.test.ts`, failing at `packages/shared/src/sandbox-gate.ts:39` on this
sandbox's crypto. Verified by running the suite on the untouched baseline with the new tests removed
— same 5. Net effect of this change: **+20 passing, 0 new failures.**
