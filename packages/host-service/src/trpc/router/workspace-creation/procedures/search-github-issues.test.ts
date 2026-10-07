import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseGitRemote } from "@superset/shared/git-remote";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db/db";
import * as schema from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

if (process.env.SUPERSET_SEARCH_CALLER_FIXTURE !== "issue") {
	test("issue search runs with isolated transport boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-search-issue-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_SEARCH_CALLER_FIXTURE: "issue",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
} else {
	mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
	const remotes = new Map<string, Map<string, string>>();
	let workerError: Error | null = null;
	mock.module("../../../../runtime/git/simple-git", () => ({
		createUserSimpleGit: (repoPath: string) => ({
			revparse: async () => repoPath,
			raw: async () =>
				[...(remotes.get(repoPath) ?? [])]
					.map(([name, url]) => `remote.${name}.url ${url}`)
					.join("\n"),
		}),
	}));
	mock.module("../../../../workers/host-worker-pool", () => ({
		getHostWorkerPool: () => ({
			run: async (task: { type: string }, input: { repoPath: string }) => {
				if (workerError) throw workerError;
				if (task.type !== "git/resolveRepository")
					throw new Error("Unexpected worker operation");
				return {
					repoPath: input.repoPath,
					remotes: [...(remotes.get(input.repoPath) ?? [])].flatMap(
						([name, url]) => {
							const parsed = parseGitRemote(url);
							return parsed ? [[name, parsed]] : [];
						},
					),
				};
			},
		}),
	}));
	const { router } = await import("../../../index");
	const { searchGitHubIssues } = await import("./search-github-issues");
	const originalFetch = globalThis.fetch;
	let sqlite: Database;
	let db: HostDb;
	let requests: URL[];
	let tokenHosts: string[];
	let ghRequests: string[][];
	let token: string | null;
	let respond: (url: URL) => Response;
	let ghRespond: (args: string[]) => unknown;

	beforeEach(() => {
		sqlite = new Database(":memory:");
		const fixtureDb = drizzle(sqlite, { schema });
		migrate(fixtureDb, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		db = fixtureDb as unknown as HostDb;
		requests = [];
		tokenHosts = [];
		ghRequests = [];
		token = "fixture-scoped-token";
		remotes.clear();
		workerError = null;
		respond = (url) => {
			if (url.pathname === "/api/v4/version")
				return new Response(null, { status: 404 });
			return Response.json([item(url.host)], {
				headers: { "x-total": "1", "x-next-page": "" },
			});
		};
		ghRespond = () => {
			throw new Error("GitHub transport must not handle GitLab");
		};
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url,
				);
				requests.push(url);
				if (url.pathname !== "/api/v4/version")
					expect(new Headers(init?.headers).get("Authorization")).toBe(
						"Bearer fixture-scoped-token",
					);
				return respond(url);
			},
			{ preconnect: originalFetch.preconnect },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		sqlite.close();
	});
	function seed(
		id = "gl",
		url = "https://gitlab.com/Group/Sub/Widget.git",
		remoteName = "origin",
	) {
		db.insert(schema.projects)
			.values({
				id,
				repoPath: `/fixture/${id}`,
				repoProvider: "gitlab",
				repoUrl: url,
				remoteName,
			})
			.run();
		remotes.set(`/fixture/${id}`, new Map([[remoteName, url]]));
	}
	function item(
		host = "gitlab.com",
		number = 7,
		updated = "2026-10-02T00:00:00Z",
	) {
		return {
			iid: number,
			title: "Native GitLab item",
			web_url: `https://${host}/Group/Sub/Widget/-/issues/${number}`,
			state: "opened",
			draft: true,
			author: { username: "native-author" },
			updated_at: updated,
			created_at: "2026-10-01T00:00:00Z",
			description: "Body",
			source_branch: "feature",
			target_branch: "main",
			sha: "abc123",
			source_project_id: 1,
			target_project_id: 1,
		};
	}
	function caller() {
		const ctx = {
			db,
			isAuthenticated: true,
			credentials: {
				getToken: async (host: string) => {
					tokenHosts.push(host);
					return token;
				},
				getCredentials: async () => ({ env: {} }),
				credentialRemedy: (host: string) => `Authenticate for ${host}`,
			},
			execGh: async (args: string[]) => {
				ghRequests.push(args);
				return ghRespond(args);
			},
			github: async () => {
				throw new Error("Unexpected Octokit fallback");
			},
		} as unknown as HostServiceContext;
		return router({ search: searchGitHubIssues }).createCaller(ctx);
	}
	test("uses the configured GitLab remote instead of a secondary GitHub origin", async () => {
		seed("gl", "https://gitlab.com/Group/Sub/Widget.git", "native");
		remotes
			.get("/fixture/gl")
			?.set("origin", "https://github.com/old/repository.git");
		const page = await caller().search({ projectId: "gl" });
		expect(page.issues).toMatchObject([
			{ projectId: "gl", issueNumber: 7, authorLogin: "native-author" },
		]);
		expect(ghRequests).toHaveLength(0);
		expect(tokenHosts).toEqual(["gitlab.com"]);
		expect(requests[0]?.pathname).toBe(
			"/api/v4/projects/Group%2FSub%2FWidget/issues",
		);
	});
	test("uses current remote paths and a scoped custom HTTPS port for URL direct lookup", async () => {
		seed("gl", "https://git.example.invalid:8443/Old/Widget.git");
		remotes
			.get("/fixture/gl")
			?.set("origin", "https://git.example.invalid:8443/Group/Sub/Widget.git");
		respond = (url) => Response.json(item(url.host));
		const page = await caller().search({
			projectId: "gl",
			query:
				"https://git.example.invalid:8443/Group/Sub/Widget/-/issues/7?view=diff#note_9",
		});
		expect(page.issues).toHaveLength(1);
		expect(requests.map((url) => `${url.host}${url.pathname}`)).toEqual([
			"git.example.invalid:8443/api/v4/projects/Group%2FSub%2FWidget/issues/7",
		]);
		expect(tokenHosts).toEqual(["git.example.invalid:8443"]);
	});
	test("routes a native URL before contacting an unrelated GitHub API", async () => {
		seed();
		seed("gh", "https://github.com/Team/Widget.git");
		respond = (url) => Response.json(item(url.host));
		const page = await caller().search({
			projectId: "gh",
			projectIds: ["gh", "gl"],
			query: "https://gitlab.com/Group/Sub/Widget/-/issues/7",
		});
		expect(page.issues.map((row) => row.projectId)).toEqual(["gl"]);
		expect(ghRequests).toHaveLength(0);
		expect(requests).toHaveLength(1);
	});
	test.each([
		"https://other.invalid/Group/Sub/Widget/-/issues/7",
		"https://gitlab.com/group/Sub/Widget/-/issues/7",
		"https://gitlab.com:8443/Group/Sub/Widget/-/issues/7",
	])("does not search a mismatched native URL %s", async (query) => {
		seed();
		const page = await caller().search({ projectId: "gl", query });
		expect(page.issues).toEqual([]);
		expect(page.repoMismatch).toContain("Group/Sub/Widget");
		expect(requests).toHaveLength(0);
		expect(tokenHosts).toHaveLength(0);
	});
	test("uses caller pagination and state flags without slicing returned native rows", async () => {
		seed();
		respond = (url) =>
			Response.json([item(url.host, 8), item(url.host, 7)], {
				headers: { "x-total": "10", "x-next-page": "3" },
			});
		const page = await caller().search({
			projectId: "gl",
			query: "change",
			page: 2,
			limit: 2,
			includeClosed: true,
		});
		expect(page.issues).toHaveLength(2);
		expect(page).toMatchObject({ totalCount: 10, hasNextPage: true, page: 2 });
		expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toMatchObject({
			search: "change",
			page: "2",
			per_page: "2",
			state: "all",
		});
	});
	test.each([
		401, 403, 429, 500,
	])("surfaces native status %i without a GitHub retry", async (status) => {
		seed();
		respond = () => new Response(null, { status });
		const codes: Record<number, string> = {
			401: "UNAUTHORIZED",
			403: "FORBIDDEN",
			429: "TOO_MANY_REQUESTS",
			500: "SERVICE_UNAVAILABLE",
		};
		await expect(caller().search({ projectId: "gl" })).rejects.toMatchObject({
			code: codes[status],
		});
		expect(ghRequests).toHaveLength(0);
	});
	test("reports missing native credentials rather than no matches", async () => {
		seed();
		token = null;
		await expect(caller().search({ projectId: "gl" })).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(requests).toHaveLength(0);
	});
	test("only treats direct 404 as a miss and recovers on the next request", async () => {
		seed();
		respond = () => new Response(null, { status: 404 });
		expect(
			(await caller().search({ projectId: "gl", query: "#7" })).issues,
		).toEqual([]);
		respond = (url) => Response.json(item(url.host));
		expect(
			(await caller().search({ projectId: "gl", query: "#7" })).issues,
		).toHaveLength(1);
	});
	test("preserves missing local clone errors in single and batch mode", async () => {
		await expect(
			caller().search({ projectId: "missing" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			cause: { kind: "PROJECT_NOT_SETUP" },
		});
		seed();
		expect(
			(
				await caller().search({
					projectId: "missing",
					projectIds: ["missing", "gl"],
				})
			).issues,
		).toHaveLength(1);
	});
	test("keeps GitHub direct issue lookup and excludes pull requests", async () => {
		seed("gh", "https://github.com/Team/Widget.git");
		ghRespond = () => ({
			number: 7,
			title: "GH issue",
			url: "https://github.com/Team/Widget/issues/7",
			state: "OPEN",
			author: { login: "alice" },
		});
		expect(
			(await caller().search({ projectId: "gh", query: "#7" })).issues,
		).toMatchObject([{ projectId: "gh", authorLogin: "alice" }]);
		expect(requests).toHaveLength(0);
		ghRespond = () => ({
			number: 7,
			title: "GH PR",
			url: "https://github.com/Team/Widget/pull/7",
			state: "OPEN",
		});
		expect(
			(await caller().search({ projectId: "gh", query: "#7" })).issues,
		).toEqual([]);
	});

	test("combines mixed-provider page counts and retains same-IID project identities", async () => {
		seed();
		seed("gl2", "https://second.invalid/Group/Sub/Widget.git");
		seed("gh", "https://github.com/Team/Widget.git");
		respond = (url) =>
			Response.json(
				[
					item(
						url.host,
						7,
						url.host === "gitlab.com"
							? "2026-10-03T00:00:00Z"
							: "2026-10-01T00:00:00Z",
					),
				],
				{
					headers: {
						"x-total": "11",
						"x-next-page": url.host === "gitlab.com" ? "3" : "",
					},
				},
			);
		ghRespond = (args) =>
			args[1] === "graphql"
				? { data: { repository: {} } }
				: {
						total_count: 6,
						items: [
							{
								number: 7,
								title: "GH mixed item",
								html_url: "https://github.com/Team/Widget/issues/7",
								state: "open",
								user: { login: "alice" },
								repository_url: "https://api.github.com/repos/Team/Widget",
								updated_at: "2026-10-02T00:00:00Z",
							},
						],
					};
		const page = await caller().search({
			projectId: "gh",
			projectIds: ["gh", "gl", "gl2"],
			page: 2,
			limit: 5,
		});
		expect(page.issues.map((row) => [row.projectId, row.issueNumber])).toEqual([
			["gl", 7],
			["gh", 7],
			["gl2", 7],
		]);
		expect(page).toMatchObject({ totalCount: 28, hasNextPage: true, page: 2 });
		expect(requests.every((url) => url.searchParams.get("page") === "2")).toBe(
			true,
		);
	});
	test("does not conceal a failed native project behind successful GitHub results", async () => {
		seed();
		seed("gh", "https://github.com/Team/Widget.git");
		respond = () => new Response(null, { status: 503 });
		ghRespond = () => ({ total_count: 0, items: [] });
		await expect(
			caller().search({ projectId: "gh", projectIds: ["gh", "gl"] }),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	});
	test.each([
		"transport",
		"json",
	])("surfaces native %s failures", async (failure) => {
		seed();
		respond = () => {
			if (failure === "transport")
				throw new TypeError("Fixture transport failed");
			return new Response("invalid json");
		};
		await expect(caller().search({ projectId: "gl" })).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		expect(ghRequests).toHaveLength(0);
	});
	test("preserves a GitHub fallback for an undetected custom selected remote", async () => {
		seed("gh", "https://custom.invalid/Team/Widget.git", "custom");
		db.update(schema.projects).set({ repoProvider: null, repoUrl: null }).run();
		remotes
			.get("/fixture/gh")
			?.set("origin", "https://github.com/Team/Widget.git");
		ghRespond = () => ({ total_count: 0, items: [] });
		const page = await caller().search({ projectId: "gh" });
		expect(page.issues).toEqual([]);
		expect(requests.map((url) => url.pathname)).toEqual(["/api/v4/version"]);
		expect(ghRequests).toHaveLength(1);
	});
	test("rejects an invalid native IID without either provider request", async () => {
		seed();
		await expect(
			caller().search({
				projectId: "gl",
				query: "https://gitlab.com/Group/Sub/Widget/-/issues/0",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(requests).toHaveLength(0);
		expect(ghRequests).toHaveLength(0);
	});
	test("preserves opposite-kind native URLs as literal free text", async () => {
		seed();
		const query = "https://gitlab.com/Group/Sub/Widget/-/merge_requests/7";
		await caller().search({ projectId: "gl", query });
		expect(requests[0]?.searchParams.get("search")).toBe(query);
	});

	test("does not select a secondary GitHub remote after native remote inspection fails", async () => {
		seed();
		remotes
			.get("/fixture/gl")
			?.set("secondary-gh", "https://github.com/Team/Widget.git");
		workerError = new Error("Fixture worker inspection failed");
		ghRespond = () => ({ total_count: 0, items: [] });
		await expect(caller().search({ projectId: "gl" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(ghRequests).toHaveLength(0);
	});
}
