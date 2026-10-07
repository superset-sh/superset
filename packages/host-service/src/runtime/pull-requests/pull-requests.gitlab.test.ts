import { Database } from "bun:sqlite";
import { afterEach, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import { applyRepoSchema } from "../../db/repo-schema";
import * as schema from "../../db/schema";
import {
	PullRequestRuntimeManager,
	type PullRequestRuntimeManagerOptions,
} from "./pull-requests";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function dbFixture() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, {
		migrationsFolder: resolve(import.meta.dir, "../../../drizzle"),
	});
	applyRepoSchema(sqlite);
	return db as unknown as HostDb;
}
function seed(
	db: HostDb,
	id: string,
	host: string,
	branch = "Feature",
	owner = "Team/Sub",
) {
	db.insert(schema.projects)
		.values({
			id,
			repoPath: `/${id}`,
			createdAt: 1,
			repoProvider: "gitlab",
			repoUrl: `https://${host}/${owner}/Repo`,
			repoOwner: owner,
			repoName: "Repo",
			remoteName: "origin",
		})
		.run();
	db.insert(schema.workspaces)
		.values({
			id: `ws-${id}`,
			projectId: id,
			worktreePath: `/${id}/ws`,
			branch,
			createdAt: 1,
			headSha: "head",
			upstreamOwner: owner,
			upstreamRepo: "Repo",
			upstreamBranch: branch,
		})
		.run();
}
function manager(
	db: HostDb,
	hosts: Record<string, string>,
	token: PullRequestRuntimeManagerOptions["getGitLabToken"] = async () =>
		"HOST_SCOPED_FAKE_TOKEN",
	trackedHosts = hosts,
	repositories: {
		base?: Record<string, string>;
		head?: Record<string, string>;
		remoteHeads?: Record<string, string | null>;
	} = {},
) {
	return new PullRequestRuntimeManager({
		db,
		execGh: async () => {
			throw new Error("GH unavailable; GL must not use gh");
		},
		github: async () => {
			throw new Error("GL must not use Octokit");
		},
		gitWatcher: { onChanged: () => () => {} } as never,
		getGitLabToken: token,
		worktreeExists: () => true,
		readWorkspaceRefs: async (path) => {
			const row = db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.worktreePath, path))
				.get();
			if (!row?.projectId) throw new Error("Missing workspace fixture");
			const head = repositories.head?.[`/${row.projectId}`];
			const slash = head?.lastIndexOf("/") ?? -1;
			return {
				branch: row.branch,
				headSha: row.headSha,
				upstream: {
					owner: head
						? head.slice(0, slash)
						: (row.upstreamOwner ?? "Team/Sub"),
					name: head ? head.slice(slash + 1) : (row.upstreamRepo ?? "Repo"),
					branch: row.upstreamBranch ?? row.branch,
					host: trackedHosts[`/${row.projectId}`],
					provider: "gitlab",
				},
			};
		},
		git: (async (path: string) => ({
			remote: async () =>
				`https://${hosts[path]}/${repositories.base?.[path] ?? "Team/Sub/Repo"}.git`,
			raw: async (args: string[]) => {
				if (args[0] === "config") {
					const project = db
						.select()
						.from(schema.projects)
						.where(eq(schema.projects.repoPath, path))
						.get();
					return `remote.${project?.remoteName ?? "origin"}.url https://${hosts[path]}/${repositories.base?.[path] ?? "Team/Sub/Repo"}.git`;
				}
				if (!repositories.remoteHeads) return "origin/main";
				const ref = args.find((arg) => arg.startsWith("refs/remotes/"));
				const remote = ref
					?.slice("refs/remotes/".length)
					.replace(/\/HEAD$/, "");
				const head = remote ? repositories.remoteHeads[remote] : null;
				if (!head) throw new Error("Selected remote HEAD absent");
				return head;
			},
		})) as never,
	});
}
function refresh(runtime: PullRequestRuntimeManager, id: string) {
	return runtime.refreshPullRequestsByWorkspaces([`ws-${id}`]);
}
function sweep(runtime: PullRequestRuntimeManager, id: string) {
	return (
		runtime as unknown as { refreshProject(id: string): Promise<void> }
	).refreshProject(id);
}
function fixtureFetch(branch = "Feature") {
	return mock(async (input: string | URL | Request) => {
		const url = new URL(String(input));
		const path = url.pathname;
		if (path === "/api/v4/version")
			return Response.json({ version: "18.1.2-ee", revision: "abcdef1234" });
		const approved = url.host === "one.internal:8443";
		const mr = {
			iid: 7,
			title: url.host,
			web_url: `https://${url.host}/Team/Sub/Repo/-/merge_requests/7`,
			state: "opened",
			draft: false,
			sha: "head",
			source_branch: branch,
			target_branch: "main",
			source_project_id: 1,
			target_project_id: 1,
			updated_at: "2026-10-04T00:00:00Z",
			merged_at: null,
			detailed_merge_status: approved ? "mergeable" : "not_approved",
			blocking_discussions_resolved: true,
			has_conflicts: false,
		};
		const data = path.endsWith("/approvals")
			? {
					approvals_required: 1,
					approvals_left: approved ? 0 : 1,
					approved_by: approved ? [{ user: { username: "reviewer" } }] : [],
				}
			: path.endsWith("/merge_requests/7")
				? mr
				: path.endsWith("/merge_requests")
					? [mr]
					: path.endsWith("/pipelines")
						? [{ id: 2, sha: "head" }]
						: path.endsWith("/jobs")
							? [
									{
										id: 2,
										name: "test",
										status: approved ? "success" : "failed",
										allow_failure: false,
										web_url: `https://${url.host}/jobs/2`,
										started_at: null,
										finished_at: null,
									},
								]
							: path.endsWith("/statuses")
								? []
								: null;
		if (data === null) throw new Error(`Unexpected request ${url}`);
		return new Response(JSON.stringify(data), {
			headers: { "Content-Type": "application/json", "x-next-page": "" },
		});
	}) as unknown as typeof fetch;
}
test("two GitLab instances persist independent MR numbers, checks and reviews with gh absent", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	seed(db, "two", "two.internal");
	globalThis.fetch = fixtureFetch();
	const runtime = manager(db, {
		"/one": "one.internal:8443",
		"/two": "two.internal",
	});
	await refresh(runtime, "one");
	await refresh(runtime, "two");
	const prs = db.select().from(schema.pullRequests).all();
	expect(prs).toHaveLength(2);
	expect(prs.find((p) => p.repoHost === "one.internal:8443")).toMatchObject({
		prNumber: 7,
		reviewDecision: "approved",
		checksStatus: "success",
		headBranch: "Feature",
	});
	expect(prs.find((p) => p.repoHost === "two.internal")).toMatchObject({
		prNumber: 7,
		reviewDecision: "pending",
		checksStatus: "failure",
	});
	const snapshots = await runtime.getPullRequestsByWorkspaces([
		"ws-one",
		"ws-two",
	]);
	expect(snapshots[1]?.pullRequest?.reviewDecision).toBe("pending");
	expect(snapshots.map((s) => s.pullRequest?.title)).toEqual([
		"one.internal:8443",
		"two.internal",
	]);
	expect(
		(runtime as unknown as { pullRequestHeadCache: Map<string, unknown> })
			.pullRequestHeadCache.size,
	).toBe(2);
	expect(
		(runtime as unknown as { pullRequestDetailsCache: Map<string, unknown> })
			.pullRequestDetailsCache.size,
	).toBe(2);
});
test("GitLab branch and namespace casing never fall through to GitHub's case drift sweep", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443", "feature");
	seed(db, "two", "two.internal", "Feature", "team/sub");
	globalThis.fetch = fixtureFetch();
	const runtime = manager(db, {
		"/one": "one.internal:8443",
		"/two": "two.internal",
	});
	await refresh(runtime, "one");
	await refresh(runtime, "two");
	expect(db.select().from(schema.pullRequests).all()).toHaveLength(0);
});
test("remote change invalidates stale GitLab instance metadata before selecting credentials", async () => {
	const db = dbFixture();
	seed(db, "one", "old.internal:8443");
	globalThis.fetch = fixtureFetch();
	const runtime = manager(db, { "/one": "gitlab.com" });
	await refresh(runtime, "one");
	expect(db.select().from(schema.pullRequests).all()[0]?.repoHost).toBe(
		"gitlab.com",
	);
	expect(
		db.select().from(schema.projects).where(eq(schema.projects.id, "one")).get()
			?.repoUrl,
	).toBe("https://gitlab.com/Team/Sub/Repo");
});
test("missing GitLab credentials preserve the existing link and expose its fetch error", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	await refresh(manager(db, { "/one": "one.internal:8443" }), "one");
	const runtime = manager(
		db,
		{ "/one": "one.internal:8443" },
		async () => null,
	);
	await refresh(runtime, "one");
	const [snapshot] = await runtime.getPullRequestsByWorkspaces(["ws-one"]);
	expect(snapshot?.pullRequest?.number).toBe(7);
	expect(snapshot?.error).toContain("No GitLab token");
});
test("GitLab check failure retains prior checks and surfaces the detail error", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	await refresh(manager(db, { "/one": "one.internal:8443" }), "one");
	const priorFetch = globalThis.fetch;
	globalThis.fetch = mock(async (...args: Parameters<typeof fetch>) =>
		String(args[0]).includes("/pipelines?")
			? new Response("", { status: 503 })
			: priorFetch(...args),
	) as unknown as typeof fetch;
	const runtime = manager(db, { "/one": "one.internal:8443" });
	await refresh(runtime, "one");
	const [snapshot] = await runtime.getPullRequestsByWorkspaces(["ws-one"]);
	expect(snapshot?.pullRequest?.checksStatus).toBe("success");
	expect(snapshot?.error).toContain("GitLab 503");
});

test("GitLab persisted slug-only refs wait for a fresh read before linking", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	const runtime = manager(db, { "/one": "one.internal:8443" });
	await sweep(runtime, "one");
	expect(db.select().from(schema.pullRequests).all()).toHaveLength(0);
	await refresh(runtime, "one");
	expect(
		(await runtime.getPullRequestsByWorkspaces(["ws-one"]))[0]?.pullRequest
			?.number,
	).toBe(7);
});
test("fresh upstream host excludes an identical slug on the project's other GitLab instance", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	const runtime = manager(db, { "/one": "one.internal:8443" }, undefined, {
		"/one": "two.internal",
	});
	await refresh(runtime, "one");
	expect(db.select().from(schema.pullRequests).all()).toHaveLength(0);
	expect(
		(await runtime.getPullRequestsByWorkspaces(["ws-one"]))[0]?.pullRequest,
	).toBeNull();
});
test("fresh remote repoint with unchanged HEAD clears only current link and keeps history", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	const live = { "/one": "one.internal:8443" };
	const tracked = { "/one": "one.internal:8443" };
	const runtime = manager(db, live, undefined, tracked);
	await refresh(runtime, "one");
	const oldId = db.select().from(schema.workspaces).get()?.pullRequestId;
	expect(oldId).toBeTruthy();
	if (!oldId) throw new Error("Initial PR link missing");
	tracked["/one"] = "two.internal";
	await refresh(runtime, "one");
	expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBeNull();
	expect(
		db
			.select()
			.from(schema.workspacePullRequests)
			.all()
			.map((row) => row.pullRequestId),
	).toEqual([oldId]);
	live["/one"] = "two.internal";
	await refresh(runtime, "one");
	expect(
		(await runtime.getPullRequestsByWorkspaces(["ws-one"]))[0]?.pullRequest
			?.title,
	).toBe("two.internal");
	expect(db.select().from(schema.workspacePullRequests).all()).toHaveLength(2);
});

test("GitLab native approval remains visible when premium counts are unavailable", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	const fetchFixture = fixtureFetch();
	globalThis.fetch = mock(async (...args: Parameters<typeof fetch>) =>
		String(args[0]).endsWith("/approvals")
			? Response.json({ approved_by: [{ user: { username: "reviewer" } }] })
			: fetchFixture(...args),
	) as unknown as typeof fetch;
	await refresh(manager(db, { "/one": "one.internal:8443" }), "one");
	expect(
		(await manager(db, {}).getPullRequestsByWorkspaces(["ws-one"]))[0]
			?.pullRequest?.reviewDecision,
	).toBe("approved");
});
test("GitLab network failure preserves known link and reports error without tripping GitHub gate", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = fixtureFetch();
	await refresh(manager(db, { "/one": "one.internal:8443" }), "one");
	globalThis.fetch = mock(async () => {
		throw new Error("GitLab instance unreachable");
	}) as unknown as typeof fetch;
	const runtime = manager(db, { "/one": "one.internal:8443" });
	await refresh(runtime, "one");
	const [snapshot] = await runtime.getPullRequestsByWorkspaces(["ws-one"]);
	expect(snapshot?.pullRequest?.number).toBe(7);
	expect(snapshot?.error).toBe("GitLab instance unreachable");
	expect(runtime.getGithubStatus()).toBeNull();
});

function forkFetch() {
	const answer = fixtureFetch();
	return mock(async (...args: Parameters<typeof fetch>) => {
		const url = new URL(String(args[0]));
		if (url.pathname.endsWith("/projects/2"))
			return Response.json({ path_with_namespace: "Fork/Sub/Source" });
		const response = await answer(...args);
		if (url.pathname.endsWith("/merge_requests")) {
			const data = await response.json();
			if (!Array.isArray(data))
				throw new Error("Invalid merge request fixture");
			return Response.json(
				data.map((mr: Record<string, unknown>) => ({
					...mr,
					source_project_id: 2,
				})),
				{ headers: { "x-next-page": "" } },
			);
		}
		return response;
	}) as unknown as typeof fetch;
}
test("verified fork target repoint clears current link on outage while source remains unchanged", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = forkFetch();
	const hosts = { "/one": "one.internal:8443" };
	const base = { "/one": "Team/Sub/Repo" };
	const head = { "/one": "Fork/Sub/Source" };
	const runtime = manager(db, hosts, undefined, hosts, { base, head });
	await refresh(runtime, "one");
	const initial = db.select().from(schema.workspaces).get()?.pullRequestId;
	if (!initial) throw new Error("Initial fork link missing");
	base["/one"] = "Team/Sub/OtherRepo";
	globalThis.fetch = mock(async () => {
		throw new Error("Fixture outage");
	}) as unknown as typeof fetch;
	await refresh(runtime, "one");
	expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBeNull();
	expect(
		db
			.select()
			.from(schema.workspacePullRequests)
			.all()
			.map((row) => row.pullRequestId),
	).toEqual([initial]);
});
test("verified fork source repoint clears current link on outage without changing base", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = forkFetch();
	const hosts = { "/one": "one.internal:8443" };
	const head = { "/one": "Fork/Sub/Source" };
	const runtime = manager(db, hosts, undefined, hosts, { head });
	await refresh(runtime, "one");
	const initial = db.select().from(schema.workspaces).get()?.pullRequestId;
	if (!initial) throw new Error("Initial fork link missing");
	head["/one"] = "Fork/Sub/OtherSource";
	globalThis.fetch = mock(async () => {
		throw new Error("Fixture outage");
	}) as unknown as typeof fetch;
	await refresh(runtime, "one");
	expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBeNull();
	expect(
		db
			.select()
			.from(schema.workspacePullRequests)
			.all()
			.map((row) => row.pullRequestId),
	).toEqual([initial]);
});
test("ordinary fork link remains stable through refresh and outage despite different head and base repositories", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	globalThis.fetch = forkFetch();
	const hosts = { "/one": "one.internal:8443" };
	const head = { "/one": "Fork/Sub/Source" };
	const runtime = manager(db, hosts, undefined, hosts, { head });
	await refresh(runtime, "one");
	const initial = db.select().from(schema.workspaces).get()?.pullRequestId;
	if (!initial) throw new Error("Initial fork link missing");
	await refresh(runtime, "one");
	expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBe(
		initial,
	);
	globalThis.fetch = mock(async () => {
		throw new Error("Fixture outage");
	}) as unknown as typeof fetch;
	await refresh(runtime, "one");
	expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBe(
		initial,
	);
});

for (const [gitlabHead, originHead, branch] of [
	["gitlab/master", "origin/main", "master"],
	["gitlab/main", "origin/master", "main"],
	[null, "origin/master", "main"],
] as const) {
	test(`configured GitLab default remote ${gitlabHead ?? "missing HEAD"} excludes a feature tracking ${branch}`, async () => {
		const db = dbFixture();
		seed(db, "one", "one.internal:8443");
		db.update(schema.projects).set({ remoteName: "gitlab" }).run();
		db.update(schema.workspaces).set({ upstreamBranch: branch }).run();
		globalThis.fetch = fixtureFetch(branch);
		const hosts = { "/one": "one.internal:8443" };
		const runtime = manager(db, hosts, undefined, hosts, {
			remoteHeads: { gitlab: gitlabHead, origin: originHead },
		});
		await refresh(runtime, "one");
		expect(db.select().from(schema.pullRequests).all()).toHaveLength(0);
	});
}
test("missing configured GitLab HEAD does not borrow origin's different default", async () => {
	const db = dbFixture();
	seed(db, "one", "one.internal:8443");
	db.update(schema.projects).set({ remoteName: "gitlab" }).run();
	db.update(schema.workspaces).set({ upstreamBranch: "master" }).run();
	globalThis.fetch = fixtureFetch("master");
	const hosts = { "/one": "one.internal:8443" };
	const runtime = manager(db, hosts, undefined, hosts, {
		remoteHeads: { gitlab: null, origin: "origin/master" },
	});
	await refresh(runtime, "one");
	expect(db.select().from(schema.pullRequests).all()).toHaveLength(1);
});

function verifiedLinkFixture(db: HostDb) {
	const project = db.select().from(schema.projects).get();
	const workspace = db.select().from(schema.workspaces).get();
	if (!project || !workspace) throw new Error("Missing verified fixture rows");
	return {
		repo: {
			provider: "gitlab" as const,
			host: "one.internal:8443",
			owner: "Team/Sub",
			name: "Repo",
			url: "https://one.internal:8443/Team/Sub/Repo",
		},
		project: { ...project },
		workspace: { ...workspace },
		isCurrent: () => true,
	};
}
const verifiedMr = {
	number: 7,
	url: "https://one.internal:8443/Team/Sub/Repo/-/merge_requests/7",
	title: "Verified MR",
	state: "open" as const,
	headRefName: "Feature",
	headRefOid: "verified-head",
	isCrossRepository: false,
};
for (const change of [
	"none",
	"workspace",
	"pointer",
	"project",
	"foreign-pr",
	"write-failure",
] as const) {
	test(`strict verified checkout association: ${change}`, async () => {
		const db = dbFixture();
		seed(db, "one", "one.internal:8443");
		const verifiedCheckout = verifiedLinkFixture(db);
		const runtime = manager(db, { "/one": "one.internal:8443" });
		if (change === "workspace")
			db.update(schema.workspaces).set({ createdAt: 2 }).run();
		if (change === "project")
			db.update(schema.projects).set({ remoteName: "other" }).run();
		if (change === "pointer" || change === "foreign-pr") {
			if (change === "foreign-pr")
				db.insert(schema.projects)
					.values({ id: "foreign", repoPath: "/foreign" })
					.run();
			db.insert(schema.pullRequests)
				.values({
					id: "existing-pr",
					projectId: change === "foreign-pr" ? "foreign" : "one",
					repoProvider: "gitlab",
					repoHost: "one.internal:8443",
					repoOwner: "Team/Sub",
					repoName: "Repo",
					prNumber: change === "pointer" ? 8 : 7,
					url: verifiedMr.url,
					title: "Existing",
					state: "open",
					headBranch: "Feature",
					headSha: "old-head",
				})
				.run();
			if (change === "pointer")
				db.update(schema.workspaces)
					.set({ pullRequestId: "existing-pr" })
					.run();
		}
		if (change === "write-failure")
			db.run(
				sql.raw(
					"CREATE TRIGGER refuse_link BEFORE UPDATE OF pull_request_id ON workspaces BEGIN SELECT RAISE(ABORT, 'OWNED_LINK_FAILURE'); END",
				),
			);
		const linking = runtime.linkWorkspaceToCheckoutPullRequest({
			workspaceId: "ws-one",
			projectId: "one",
			pullRequest: verifiedMr,
			...{ verifiedCheckout },
		});
		if (change === "none") {
			const id = await linking;
			expect(id).toBeString();
			expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBe(id);
			expect(db.select().from(schema.workspacePullRequests).all()).toHaveLength(
				1,
			);
		} else {
			await expect(linking).rejects.toThrow();
			expect(db.select().from(schema.workspacePullRequests).all()).toHaveLength(
				0,
			);
			expect(db.select().from(schema.pullRequests).all()).toHaveLength(
				change === "pointer" || change === "foreign-pr" ? 1 : 0,
			);
			if (change === "foreign-pr")
				expect(db.select().from(schema.pullRequests).get()?.projectId).toBe(
					"foreign",
				);
		}
	});
}

function selectedRemoteRuntime(
	db: HostDb,
	remotes: Record<string, string>,
	configError?: Error,
) {
	const remoteReads: string[][] = [];
	const tokenRequests = mock(async () => "HOST_SCOPED_FAKE_TOKEN");
	const githubRequests = mock(async () => {
		throw Error("Unexpected old GitHub authority");
	});
	const runtime = new PullRequestRuntimeManager({
		db,
		github: githubRequests,
		execGh: async () => {
			throw Error("Unexpected gh authority");
		},
		gitWatcher: { onChanged: () => () => {} } as never,
		getGitLabToken: tokenRequests,
		worktreeExists: () => true,
		readWorkspaceRefs: async () => ({
			branch: "Feature",
			headSha: "head",
			upstream: {
				owner: "Team/Sub",
				name: "Repo",
				branch: "Feature",
				host: "one.internal:8443",
				provider: "gitlab",
			},
		}),
		git: (async () => ({
			remote: async (args: string[]) => {
				remoteReads.push(args);
				const url = remotes[args[1] ?? ""];
				if (!url) throw Error("Selected remote absent");
				return url;
			},
			raw: async (args: string[]) => {
				if (args[0] === "config" && configError) throw configError;
				return args[0] === "config"
					? Object.entries(remotes)
							.map(([name, url]) => `remote.${name}.url ${url}`)
							.join("\n")
					: "gitlab/main";
			},
		})) as never,
	});
	return { runtime, githubRequests, remoteReads, tokenRequests };
}
for (const association of [
	"existing-current-link",
	"just-verified-checkout",
] as const) {
	test(`cached GitHub metadata does not override live GitLab with ${association}`, async () => {
		const db = dbFixture();
		try {
			seed(db, "one", "one.internal:8443");
			db.update(schema.projects)
				.set({
					repoProvider: "github",
					repoOwner: "Old",
					repoName: "GhRepo",
					repoUrl: "https://github.com/Old/GhRepo",
					remoteName: "gitlab",
				})
				.run();
			const { runtime, githubRequests } = selectedRemoteRuntime(db, {
				gitlab: "https://one.internal:8443/Team/Sub/Repo.git",
			});
			const verifiedCheckout = verifiedLinkFixture(db);
			if (association === "just-verified-checkout") {
				await runtime.linkWorkspaceToCheckoutPullRequest({
					workspaceId: "ws-one",
					projectId: "one",
					pullRequest: verifiedMr,
					verifiedCheckout,
				});
			} else {
				db.insert(schema.pullRequests)
					.values({
						id: "current-gl",
						projectId: "one",
						repoProvider: "gitlab",
						repoHost: "one.internal:8443",
						repoOwner: "Team/Sub",
						repoName: "Repo",
						prNumber: 7,
						url: verifiedMr.url,
						title: "Before refresh",
						state: "open",
						headBranch: "Feature",
						headSha: "head",
					})
					.run();
				db.update(schema.workspaces).set({ pullRequestId: "current-gl" }).run();
			}
			const selectedId = db
				.select()
				.from(schema.workspaces)
				.get()?.pullRequestId;
			globalThis.fetch = fixtureFetch();
			await refresh(runtime, "one");
			expect(githubRequests).not.toHaveBeenCalled();
			expect(
				db
					.select()
					.from(schema.pullRequests)
					.where(eq(schema.pullRequests.id, selectedId ?? "missing"))
					.get()?.title,
			).toBe("one.internal:8443");
			expect(db.select().from(schema.projects).get()?.repoProvider).toBe(
				"gitlab",
			);
		} finally {
			db.$client.close();
		}
	});
}
for (const configured of [null, "missing"] as const) {
	test(`GitLab runtime selects the available remote when configured ${configured ?? "null"} and origin absent`, async () => {
		const db = dbFixture();
		try {
			seed(db, "one", "one.internal:8443");
			db.update(schema.projects).set({ remoteName: configured }).run();
			const { runtime, githubRequests } = selectedRemoteRuntime(db, {
				gitlab: "https://one.internal:8443/Team/Sub/Repo.git",
			});
			globalThis.fetch = fixtureFetch();
			await refresh(runtime, "one");
			expect(githubRequests).not.toHaveBeenCalled();
			expect(db.select().from(schema.pullRequests).get()?.title).toBe(
				"one.internal:8443",
			);
			expect(db.select().from(schema.projects).get()?.remoteName).toBe(
				"gitlab",
			);
		} finally {
			db.$client.close();
		}
	});
}

for (const association of [
	"none",
	"archived",
	"history-only",
	"foreign-pr",
] as const) {
	test(`ordinary cached GitHub identity remains unchanged with ${association} GL evidence`, async () => {
		const db = dbFixture();
		try {
			seed(db, "one", "one.internal:8443");
			db.update(schema.projects)
				.set({
					repoProvider: "github",
					repoOwner: "Old",
					repoName: "GhRepo",
					repoUrl: "https://github.com/Old/GhRepo",
					remoteName: "origin",
				})
				.run();
			if (association !== "none") {
				if (association === "foreign-pr")
					db.insert(schema.projects)
						.values({ id: "foreign", repoPath: "/foreign" })
						.run();
				db.insert(schema.pullRequests)
					.values({
						id: "gl-evidence",
						projectId: association === "foreign-pr" ? "foreign" : "one",
						repoProvider: "gitlab",
						repoHost: "one.internal:8443",
						repoOwner: "Team/Sub",
						repoName: "Repo",
						prNumber: 7,
						url: verifiedMr.url,
						title: "GL",
						state: "open",
						headBranch: "Feature",
						headSha: "head",
					})
					.run();
				if (association === "history-only")
					db.insert(schema.workspacePullRequests)
						.values({
							workspaceId: "ws-one",
							pullRequestId: "gl-evidence",
							linkedAt: 1,
						})
						.run();
				else
					db.update(schema.workspaces)
						.set({
							pullRequestId: "gl-evidence",
							...(association === "archived" ? { archivedAt: 2 } : {}),
						})
						.run();
			}
			const { runtime, remoteReads, githubRequests, tokenRequests } =
				selectedRemoteRuntime(db, {
					gitlab: "https://one.internal:8443/Team/Sub/Repo.git",
				});
			const selected = await (
				runtime as unknown as {
					getProjectRepository(id: string): Promise<{
						provider: string;
						url: string;
						owner: string;
						name: string;
						remoteName: string;
					} | null>;
				}
			).getProjectRepository("one");
			expect(selected).toMatchObject({
				provider: "github",
				url: "https://github.com/Old/GhRepo",
				owner: "Old",
				name: "GhRepo",
				remoteName: "origin",
			});
			expect(remoteReads).toEqual([]);
			expect(tokenRequests).not.toHaveBeenCalled();
			expect(githubRequests).not.toHaveBeenCalled();
		} finally {
			db.$client.close();
		}
	});
}

for (const remoteState of [
	"absent",
	"malformed",
	"inspection-error",
] as const) {
	test(`current GL cue cannot establish authority from ${remoteState} live remotes`, async () => {
		const db = dbFixture();
		try {
			seed(db, "one", "one.internal:8443");
			db.update(schema.projects)
				.set({
					repoProvider: "github",
					repoOwner: "Old",
					repoName: "GhRepo",
					repoUrl: "https://github.com/Old/GhRepo",
					remoteName: "gitlab",
				})
				.run();
			const { runtime, githubRequests, tokenRequests } = selectedRemoteRuntime(
				db,
				remoteState === "malformed" ? { gitlab: "not-a-git-remote" } : {},
				remoteState === "inspection-error"
					? Error("OWNED_CONFIG_READ_FAILURE")
					: undefined,
			);
			await runtime.linkWorkspaceToCheckoutPullRequest({
				workspaceId: "ws-one",
				projectId: "one",
				pullRequest: verifiedMr,
				verifiedCheckout: verifiedLinkFixture(db),
			});
			const linkedId = db.select().from(schema.workspaces).get()?.pullRequestId;
			const transport = mock(async () => {
				throw Error("Authority must not be inferred from cue");
			});
			globalThis.fetch = Object.assign(transport, { preconnect() {} });
			await refresh(runtime, "one");
			expect(transport).not.toHaveBeenCalled();
			expect(githubRequests).not.toHaveBeenCalled();
			expect(tokenRequests).not.toHaveBeenCalled();
			expect(db.select().from(schema.projects).get()?.repoProvider).toBe(
				"github",
			);
			expect(db.select().from(schema.workspaces).get()?.pullRequestId).toBe(
				linkedId,
			);
		} finally {
			db.$client.close();
		}
	});
}
for (const configured of ["gitlab", "missing"] as const) {
	test(`GL live selection honors ${configured === "gitlab" ? "configured" : "origin fallback"} before first remote`, async () => {
		const db = dbFixture();
		try {
			seed(db, "one", "one.internal:8443");
			db.update(schema.projects).set({ remoteName: configured }).run();
			const { runtime } = selectedRemoteRuntime(db, {
				first: "https://two.internal/Team/Sub/Repo.git",
				origin: "https://one.internal:8443/Team/Sub/Repo.git",
				gitlab: "https://one.internal:8443/Team/Sub/Repo.git",
			});
			globalThis.fetch = fixtureFetch();
			await refresh(runtime, "one");
			expect(db.select().from(schema.projects).get()?.remoteName).toBe(
				configured === "gitlab" ? "gitlab" : "origin",
			);
			expect(db.select().from(schema.pullRequests).get()?.repoHost).toBe(
				"one.internal:8443",
			);
		} finally {
			db.$client.close();
		}
	});
}
