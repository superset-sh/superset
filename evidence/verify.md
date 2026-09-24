# P1-D — GitHub member authorization boundary (verify only)

**Task:** P1-D · **Branch:** `superset/p1-d-github-member-authz-verify-b942a4de` · **Date:** 2026-09-24
**Tickets:** customer report (Hugo); SUPER-2022 (Backlog / Medium, *design*), SUPER-2432
**Scope:** read-only trace of the tRPC procedures and guards. **No code changed. Nothing run against production.**

## Verdict: **CONFIRMED**

An organization MEMBER (role `member`, no admin/owner rights, no explicit share) can reach the
contents of the GitHub App installation connected to the org — including private repositories that
belong to the OWNER personally — because **every guard on the GitHub surface is plain org
membership**. There is **no per-member and no per-resource sharing model for GitHub repositories
anywhere in the codebase.**

Metadata exposure (repo names, private flags, branches, PR titles, collaborators) is unconditional.
Full file/folder *content* exposure is reachable through two paths, one of which has a partial
barrier that fails **open** for members who have not connected their own GitHub account.

---

## 1. The data model has no owner and no sharing

`packages/db/src/schema/github.ts:19-58` — one installation per organization, keyed only by org:

```ts
export const githubInstallations = pgTable(
	"github_installations",
	{
		organizationId: uuid("organization_id").notNull().references(() => organizations.id, ...),
		connectedByUserId: uuid("connected_by_user_id").notNull().references(() => users.id, ...),
		...
		accountType: text("account_type").notNull(), // "Organization" | "User"
	},
	(table) => [ unique("github_installations_org_unique").on(table.organizationId), ... ],
);
```

`connectedByUserId` is **recorded but never read as an authorization input** — no query in the repo
filters on it. `accountType` can be `"User"`, i.e. the owner's *personal* account, which is exactly
the reported shape.

`githubRepositories` (`packages/db/src/schema/github.ts:66-101`) carries `isPrivate` and a
denormalized `organizationId`, and again **no per-user column**:

```ts
	organizationId: uuid("organization_id").notNull().references(() => organizations.id, ...),
	...
	isPrivate: boolean("is_private").notNull().default(false),
```

Nothing resembling a share/ACL table exists for GitHub resources (`ls packages/db/src/schema/`:
`auth, enums, github, ingest, leaderboard, plugins, profiles, relations, schema, slack, types, zod`).

The sync job ingests **every** repository the installation can reach, private ones included —
`apps/api/src/app/api/github/jobs/initial-sync/route.ts:59-78`:

```ts
		const repos = await octokit.paginate(
			octokit.rest.apps.listReposAccessibleToInstallation,
			{ per_page: 100 },
		);
		...
				.values({ installationId: installationDbId, organizationId, ..., isPrivate: repo.private })
```

So if the owner installed the App on their personal account, their private repos land in a table
scoped to the *organization*, not to them.

## 2. The only guard is "are you in the org"

`packages/trpc/src/router/integration/utils.ts:7-22` — membership, role ignored:

```ts
export async function verifyOrgMembership(userId: string, organizationId: string) {
	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership) {
		throw userError({ code: "FORBIDDEN", message: "Not a member of this organization", ... });
	}
	return { membership };
}
```

`packages/db/src/utils/membership.ts:8-21` returns any `members` row; `role` (`auth.ts:152`,
`.default("member")`) is only consulted by `verifyOrgAdmin` / `verifyOrgOwner`, which **no read
procedure uses** — `verifyOrgAdmin` guards exactly one thing, `disconnect`
(`packages/trpc/src/router/integration/github/github.ts:42`).

The cloud side uses the equivalent (`packages/trpc/src/lib/cloud-guards/cloud-guards.ts:63-74`):

```ts
export function assertMember(organizationIds: string[], organizationId: string): void {
	if (!organizationIds.includes(organizationId)) {
		throw userError({ code: "FORBIDDEN", message: "Not a member of this organization", ... });
	}
}
```

`organizationIds` comes from the caller's `members` rows / JWT claim (`packages/trpc/src/trpc.ts:268`),
again with no role or resource dimension.

## 3. What an unshared member CAN reach today

### 3a. Private repository inventory — CONFIRMED, unconditional

`packages/trpc/src/router/integration/github/github.ts:100-105`:

```ts
	listRepositories: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			return listGithubRepositories(input.organizationId);
		}),
```

`packages/trpc/src/router/integration/github/trigger-options.ts:9-19` returns **whole rows**
(`findMany` with no `columns`), so `fullName`, `owner`, `defaultBranch`, `isPrivate` for every
private repo:

```ts
export async function listGithubRepositories(organizationId: string) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId), columns: { id: true },
	});
	if (!installation) return [];
	return db.query.githubRepositories.findMany({
		where: eq(githubRepositories.installationId, installation.id),
		orderBy: [desc(githubRepositories.updatedAt)],
	});
}
```

The web surface renders this to any signed-in member with no role gate —
`apps/web/src/app/(app)/(page)/integrations/github/page.tsx` (no admin check) mounts
`RepositoryList`, which calls `trpc.integration.github.listRepositories`
(`RepositoryList.tsx:26`) and shows a `Lock` badge for the private ones.

Same guard on `getInstallation:22`, `triggerSync:59`, `listPullRequests:116`,
`listOrganizationPullRequests:174`, `getByBranches:204`, `getStats:309` — PR titles, head branches,
URLs, authors and check results for the owner's private repos are all member-readable.

Collaborator logins of those private repos too, via the trigger-option source
(`trigger-options.ts:66-105`, reached through `triggerOptions: protectedProcedure` +
`verifyOrgMembership` at `packages/trpc/src/router/integration/trigger-options.ts:67-70`), which for
a **User** installation walks `GET /repos/{owner}/{repo}/collaborators` with the App token.

### 3b. Branch listing of any private repo — CONFIRMED

`packages/trpc/src/router/cloud-workspace/cloud-workspace.ts:167-188`:

```ts
	listBranches: jwtProcedure
		...
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const [repo] = await loadRepositories({ organizationId: input.organizationId, repositoryIds: [input.repositoryId] }).catch(() => []);
			if (!repo) return { defaultBranch: null, items: [] };
			return listRemoteBranches(repo, input.query);
```

`loadRepositories` (`packages/trpc/src/lib/sandbox/repositories.ts:61-87`) authorizes on
**organization only**:

```ts
			and(
				inArray(githubRepositories.id, [...args.repositoryIds]),
				eq(githubRepositories.organizationId, args.organizationId),
			),
```

and `listRemoteBranches` then reads the remote with the **App installation token**
(`packages/trpc/src/lib/sandbox/list-branches.ts:42-52`), i.e. the owner's access, not the caller's.

### 3c. Full file and folder content — CONFIRMED, with one partial barrier that fails open

Path: member creates an environment over the owner's private repo, then a cloud workspace from it,
then browses the checkout.

`environment.create` — membership only (`packages/trpc/src/router/environment/environment.ts:216-222`):

```ts
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
```

and the repository set is validated by the same org-only `loadRepositories` via
`setEnvironmentRepositories` (`environment.ts:124-140`). A member can therefore point an environment
at any of the owner's private repos.

`cloudWorkspace.create` — the one place a per-member GitHub check exists
(`cloud-workspace.ts:274-292`), and it is conditional:

```ts
			// A connected person's workspace acts as them on GitHub, so a
			// repository they cannot see would fail to clone later; say so now.
			const githubToken = await githubUserTokenFor(ctx.userId);
			if (githubToken) {
				const outOfReach = await githubRepositoriesOutOfReach({ token: githubToken, repositories });
				if (outOfReach.length > 0) {
					throw userError({ code: "FORBIDDEN", message: `Your GitHub account cannot reach ${outOfReach.join(", ")}`, ... });
				}
			}
```

`githubUserTokenFor` returns `null` when the member has never connected GitHub, or when the
connection is unconfigured/expired/revoked (`packages/trpc/src/lib/github-user/github-user.ts:218`,
`:225`, `:237`, `:268`). **The check is skipped entirely in that case** — it is a UX pre-flight
("say so now"), not an authorization gate, and it fails open.

The clone then falls back to the App's installation token, which *does* reach the private repos —
`packages/trpc/src/lib/sandbox/claim.ts:74-79`:

```ts
	// The creator's own token when they have connected GitHub: pushes and pull
	// requests are theirs. The App's installation token otherwise.
	const token =
		userToken ??
		(await installationTokenFor(checkouts.map((entry) => entry.repository)));
```

`installationTokenFor` (`packages/trpc/src/lib/sandbox/repositories.ts:223-247`) mints a token
scoped to exactly those repositories from the org's installation. The sandbox clones them, and the
member browses the tree through host-service's filesystem router
(`packages/host-service/src/trpc/router/filesystem/filesystem.ts`, surfaced by the desktop Files tab).

**Net: a member who has not connected their own GitHub account gets the owner's private repository
checked out into a box they control.** A member who *has* connected is blocked at create — so the
barrier protects precisely the wrong population.

### 3d. Someone else's existing workspace — CONFIRMED (same boundary, second door)

Even without creating anything, a member can open the owner's cloud workspace, which already has the
private checkout on disk. `loadReadyWorkspace` (`cloud-workspace.ts:137-160`) checks org membership
and nothing else — `createdByUserId` is not consulted:

```ts
	await assertCloudAccess(ctx);
	assertMember(ctx.organizationIds, row.organizationId);
```

and the comment on `access` (`cloud-workspace.ts:419-424`) states the consequence outright:

```ts
	 * This is the *only* gate. A sandbox's ports are public URLs; the gate
	 * Worker admits a request by ticket and presents the host secret to the
	 * box, so whoever holds an unexpired ticket has terminals, git, files and
	 * the desktop. Hence the checks running before anything is minted.
```

`access` (`:434`) and `hostTicket` (`:506`) both mint that ticket for any member. `cloudWorkspace.list`
(`:100-118`) and `cloudWorkspace.repositories` (`:123-166`) enumerate every workspace in the org and
the repositories each checked out, so the target is discoverable, not guessed.

Note `environments.scope === "personal"` *is* enforced (`environment.ts:189-194`, `:244-250`) — so
the codebase does have a per-creator scoping primitive. It is simply not applied to repositories,
installations, or cloud workspaces.

### 3e. Adjacent finding (not the reported issue, worth recording)

Any member can also *replace* the org's GitHub installation: `apps/api/src/app/api/github/install/route.ts:5`
uses `requireOrgMember`, and the callback upserts on the org-unique key
(`apps/api/src/app/api/github/callback/route.ts:89-101`). Only `disconnect` requires admin.

## 4. Answers to the task's questions

| Question | Answer |
|---|---|
| What authorization governs browsing/reading the owner's installation contents? | Org membership alone (`verifyOrgMembership` / `assertMember`). Role is never checked on any read path. |
| Is any org member granted read access by default? | **Yes.** Every member, on join, can read the full private-repo inventory, branches, PRs and collaborators of the owner's installation. |
| Is there per-member/per-resource sharing? | **No.** No share table, no owner column consulted, no scope on repositories or installations. The only per-creator scope in this area is `environments.scope === "personal"`. |
| Can an unshared member reach the owner's private *content* (not just metadata)? | **Yes** — via §3c when they have no GitHub connection of their own, and via §3d regardless, by opening the owner's existing cloud workspace. |

**Test coverage:** none. No test in `packages/trpc/src` exercises these guards (only
`lib/growth/github.test.ts` and `lib/sandbox/credentials.test.ts` touch GitHub/sandbox at all).

---

## 5. Smallest correct fix — DESCRIBED ONLY, NOT IMPLEMENTED

The correct authorization input already exists and is already used once: **the caller's own GitHub
identity** (`githubUserTokenFor` + `githubRepositoriesOutOfReach`,
`packages/trpc/src/lib/github-user/github-user.ts:215` and `:301`). The fix is to make it the gate
rather than a pre-flight hint, apply it everywhere private repos are exposed, and make it fail
closed.

**Step 1 — one helper (new).** `packages/trpc/src/lib/github-user/reachable-repositories.ts`:
`reachableRepositories({ userId, organizationId })` → the org's synced repos, with `isPrivate` rows
kept only when the caller's own GitHub token can `GET /repos/{owner}/{repo}`. Public rows always
pass. No connection → no private rows (fail closed). Short-TTL per-user cache, since this adds a
GitHub round trip to a listing path.

**Step 2 — use it at the four exposure points.**
- `packages/trpc/src/router/integration/github/trigger-options.ts:9` — `listGithubRepositories` takes
  `userId` and filters through the helper; callers `github.ts:104` and `repositories:26` pass it.
- `packages/trpc/src/router/integration/github/github.ts` — constrain `listPullRequests:128`,
  `listOrganizationPullRequests:176`, `getByBranches:217` and `getStats:325` to the reachable repo
  id set instead of "all repos of the installation".
- `packages/trpc/src/lib/sandbox/repositories.ts:61` — `loadRepositories` takes the caller's `userId`
  and adds reachability to its existing org check, which closes `listBranches`
  (`cloud-workspace.ts:174`) and `setEnvironmentRepositories` (`environment.ts:130`) in one edit.
- `packages/trpc/src/router/cloud-workspace/cloud-workspace.ts:276` — invert the conditional so a
  missing connection is a refusal when any repository `isPrivate`, instead of a skip.

**Step 3 — the second door (§3d).** `loadReadyWorkspace` (`cloud-workspace.ts:137`) must gate
`access`/`hostTicket` on more than membership: minimally `createdByUserId === ctx.userId` OR the
caller can reach every repository the workspace checked out. A general per-workspace share model is
the larger design question and belongs to **SUPER-2022**; the reachability check is the smallest
thing that closes the reported boundary without one.

**Product/design consequence to settle in SUPER-2022 before implementing:** members who have not
connected their GitHub account will see an empty repo picker where they see a full list today. That
is the correct behaviour, but it is a visible change and wants the onboarding nudge ("Connect GitHub
to see private repositories") designed alongside it. The `accountType === "User"` case — an owner
installing on their personal account and thereby publishing their personal private repos to the org —
deserves an explicit warning at install time (`apps/api/src/app/api/github/callback/route.ts:58`)
whatever else is decided.
