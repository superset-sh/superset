import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseGitRemote } from "@superset/shared/git-remote";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

if (process.env.SUPERSET_ISSUE_CONTENT_FIXTURE !== "1") {
	test("issue content uses isolated owned boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-content-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ISSUE_CONTENT_FIXTURE: "1",
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
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Unexpected pre-import transport");
		},
		{ preconnect() {} },
	);
	const dotenvName: string = "dotenv",
		dotenvOwner = { config: () => ({ parsed: {} }) };
	mock.module(dotenvName, () => dotenvOwner);
	expect(Object.is((await import(dotenvName)).config, dotenvOwner.config)).toBe(
		true,
	);
	let remotes = new Map<string, string>(),
		workerError: Error | null = null;
	const gitOwner = {
		createUserSimpleGit: () => ({
			revparse: async () => "/fixture",
			raw: async () =>
				[...remotes].map(([n, u]) => `remote.${n}.url ${u}`).join("\n"),
		}),
	};
	mock.module("../../../../runtime/git/simple-git", () => gitOwner);
	expect(
		Object.is(
			(await import("../../../../runtime/git/simple-git")).createUserSimpleGit,
			gitOwner.createUserSimpleGit,
		),
	).toBe(true);
	const poolOwner = {
		getHostWorkerPool: () => ({
			run: async () => {
				if (workerError) throw workerError;
				return {
					repoPath: "/fixture",
					remotes: [...remotes].flatMap(([name, url]) => {
						const parsed = parseGitRemote(url);
						return parsed ? [[name, parsed]] : [];
					}),
				};
			},
		}),
	};
	mock.module("../../../../workers/host-worker-pool", () => poolOwner);
	expect(
		Object.is(
			(await import("../../../../workers/host-worker-pool")).getHostWorkerPool,
			poolOwner.getHostWorkerPool,
		),
	).toBe(true);
	let ghCalls: string[][] = [],
		ghResult: unknown,
		ghError: Error | null = null;
	const ghOwner = {
		execGh: async (args: string[]) => {
			ghCalls.push(args);
			if (ghError) throw ghError;
			return ghResult;
		},
	};
	mock.module("../../workspace-creation/utils/exec-gh", () => ghOwner);
	expect(
		Object.is(
			(await import("../../workspace-creation/utils/exec-gh")).execGh,
			ghOwner.execGh,
		),
	).toBe(true);
	const { router } = await import("../../../index");
	const { getContent } = await import("./get-content");
	let sqlite: Database,
		db: HostDb,
		token: string | null,
		tokenHosts: string[],
		requests: URL[],
		respond: (url: URL) => Response;
	const host = "one.internal:8443",
		issueUrl = `https://${host}/Group/Sub/Widget/-/issues/7`;
	function detail(url = issueUrl, iid = 7) {
		return {
			iid,
			title: "Native issue",
			description: "Complete issue description",
			web_url: url,
			state: "opened",
			author: { username: "alice" },
			created_at: "2026-10-01T00:00:00Z",
			updated_at: "2026-10-04T00:00:00Z",
		};
	}
	beforeEach(() => {
		sqlite = new Database(":memory:");
		const fixture = drizzle(sqlite, { schema });
		migrate(fixture, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		db = fixture as unknown as HostDb;
		remotes = new Map();
		workerError = null;
		ghCalls = [];
		ghError = Error("GitLab must not use gh");
		ghResult = {
			number: 7,
			title: "GH",
			url: "https://github.com/Old/Repo/issues/7",
			state: "OPEN",
		};
		token = "FAKE_SCOPED_TOKEN";
		tokenHosts = [];
		requests = [];
		respond = (url) =>
			url.pathname === "/api/v4/version"
				? Response.json({ version: "18.1.2", revision: "abcdef1234" })
				: Response.json(detail());
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
						"Bearer FAKE_SCOPED_TOKEN",
					);
				return respond(url);
			},
			{ preconnect() {} },
		);
	});
	afterEach(() => {
		sqlite.close();
	});
	function seed(
		url = `https://${host}/Group/Sub/Widget.git`,
		configured = "native",
		provider = "gitlab",
	) {
		db.insert(schema.projects)
			.values({
				id: "project",
				repoPath: "/fixture",
				remoteName: configured,
				repoProvider: provider,
				repoUrl: url,
			})
			.run();
		remotes.set(configured, url);
	}
	function caller() {
		return router({ content: getContent }).createCaller({
			db,
			isAuthenticated: true,
			credentials: {
				getToken: async (host: string) => {
					tokenHosts.push(host);
					return token;
				},
			},
			github: async () => {
				throw Error("Unexpected Octokit");
			},
		} as unknown as HostServiceContext);
	}
	const input = { projectId: "project", issueNumber: 7 };
	test("selected native remote uses scoped API content with complete description", async () => {
		seed();
		remotes.set("origin", "https://github.com/Old/Repo.git");
		const result = await caller().content(input);
		expect(result).toMatchObject({
			number: 7,
			title: "Native issue",
			body: "Complete issue description",
			url: issueUrl,
			state: "open",
			author: "alice",
			provider: "gitlab",
			expectedIssueUrl: issueUrl,
		});
		expect(requests.map((u) => u.pathname)).toEqual([
			"/api/v4/projects/Group%2FSub%2FWidget/issues/7",
		]);
		expect(tokenHosts).toEqual([host]);
		expect(ghCalls).toEqual([]);
	});
	test("explicit native expectation canonicalizes host/default port/trailing slash", async () => {
		const url = "https://gitlab.com/Group/Sub/Widget/-/issues/7";
		seed("https://gitlab.com/Group/Sub/Widget.git");
		respond = () => Response.json(detail(url));
		const result = await caller().content({
			...input,
			expectedIssueUrl: "https://GITLAB.COM:443/Group/Sub/Widget/-/issues/7/",
		});
		expect(result).toMatchObject({
			provider: "gitlab",
			expectedIssueUrl: url,
			url,
		});
		expect(tokenHosts).toEqual(["gitlab.com"]);
		expect(ghCalls).toEqual([]);
	});
	test("explicit native acknowledgment preserves validated pathname encoding", async () => {
		seed();
		const expected = issueUrl.replace("Widget", "%57idget");
		expect(
			await caller().content({ ...input, expectedIssueUrl: expected }),
		).toMatchObject({
			provider: "gitlab",
			expectedIssueUrl: expected,
			url: issueUrl,
		});
		expect(tokenHosts).toEqual([host]);
		expect(ghCalls).toEqual([]);
	});

	for (const expected of [
		issueUrl.replace(host, "other.internal:8443"),
		issueUrl.replace(":8443", ":9443"),
		issueUrl.replace("Group/Sub", "group/Sub"),
		issueUrl.replace("/7", "/8"),
		issueUrl.replace("https://", "http://"),
		issueUrl.replace(host, `@${host}`),
		issueUrl.replace(host, `%6fne.internal:8443`),
		issueUrl.replace("Group/Sub", "Group%2fSub"),
		issueUrl.replace("Group/Sub", "Group/../Sub"),
		`${issueUrl}?private_token=x`,
		`${issueUrl}#note`,
		`${issueUrl}\n`,
	]) {
		test(`explicit native expectation refuses ${expected}`, async () => {
			seed();
			await expect(
				caller().content({ ...input, expectedIssueUrl: expected }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(tokenHosts).toEqual([]);
			expect(requests).toEqual([]);
			expect(ghCalls).toEqual([]);
		});
	}
	for (const segment of [
		"Group%252fSub",
		"Group%255cSub",
		"%252e%252e",
		"Group%250aSub",
		"Group%25250aSub",
	]) {
		test(`nested structural path ${segment} is rejected before authority discovery`, async () => {
			seed();
			const encodedUrl = issueUrl.replace("Group/Sub", `${segment}/Sub`);
			remotes.set("native", encodedUrl.replace("/-/issues/7", ".git"));
			await expect(
				caller().content({ ...input, expectedIssueUrl: encodedUrl }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(tokenHosts).toEqual([]);
			expect(requests).toEqual([]);
			expect(ghCalls).toEqual([]);
		});
	}

	test("native expectation after GH repoint rejects before any credentials/discovery", async () => {
		seed("https://github.com/Old/Repo.git", "origin", "github");
		ghError = null;
		await expect(
			caller().content({ ...input, expectedIssueUrl: issueUrl }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
		expect(ghCalls).toEqual([]);
	});
	test("matching custom remote still needs verified GL detection", async () => {
		seed(undefined, "native", "github");
		respond = () => new Response(null, { status: 404 });
		await expect(
			caller().content({ ...input, expectedIssueUrl: issueUrl }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(ghCalls).toEqual([]);
		expect(requests.every((u) => u.pathname === "/api/v4/version")).toBe(true);
	});
	for (const mismatch of ["url", "iid"]) {
		test(`native API contradictory ${mismatch} is refused`, async () => {
			seed();
			respond = () =>
				Response.json(
					detail(
						mismatch === "url"
							? issueUrl.replace(host, "other.internal")
							: issueUrl,
						mismatch === "iid" ? 8 : 7,
					),
				);
			await expect(
				caller().content({ ...input, expectedIssueUrl: issueUrl }),
			).rejects.toMatchObject({ code: "BAD_GATEWAY" });
			expect(ghCalls).toEqual([]);
		});
	}
	test("missing native token is visible without gh fallback", async () => {
		seed();
		token = null;
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(requests).toEqual([]);
		expect(ghCalls).toEqual([]);
	});
	for (const [status, code] of [
		[401, "UNAUTHORIZED"],
		[403, "FORBIDDEN"],
		[404, "NOT_FOUND"],
		[429, "TOO_MANY_REQUESTS"],
		[503, "SERVICE_UNAVAILABLE"],
	] as const) {
		test(`native content status ${status} remains typed`, async () => {
			seed();
			respond = () => new Response("secret provider body", { status });
			await expect(caller().content(input)).rejects.toMatchObject({ code });
			expect(ghCalls).toEqual([]);
		});
	}
	test("worker inspection failure does not decline to secondary GH", async () => {
		seed();
		remotes.set("origin", "https://github.com/Old/Repo.git");
		workerError = Error("OWNED_INSPECTION_FAILURE");
		ghError = null;
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			cause: workerError,
		});
		expect(ghCalls).toEqual([]);
		expect(tokenHosts).toEqual([]);
	});
	test("native transport failure is visible without provider message leakage or gh fallback", async () => {
		seed();
		respond = () => {
			throw Error("FAKE_PRIVATE_PROVIDER_DETAIL");
		};
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			message: "Unable to fetch GitLab issue content",
		});
		expect(ghCalls).toEqual([]);
	});
	test("invalid native JSON fails without gh fallback", async () => {
		seed();
		respond = () => new Response("FAKE_INVALID_JSON");
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			message: "Unable to fetch GitLab issue content",
		});
		expect(ghCalls).toEqual([]);
	});
	test("invalid native content fields are refused", async () => {
		seed();
		respond = () => Response.json({ ...detail(), title: null });
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		expect(ghCalls).toEqual([]);
	});
	test("closed native issue preserves empty description and absent author", async () => {
		seed();
		respond = () =>
			Response.json({
				...detail(),
				state: "closed",
				description: null,
				author: null,
			});
		expect(await caller().content(input)).toMatchObject({
			state: "closed",
			body: "",
			author: null,
			provider: "gitlab",
			expectedIssueUrl: issueUrl,
		});
	});
	test("successfully absent remote retains original GH missing-remote error", async () => {
		seed();
		remotes.clear();
		ghError = null;
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Repository at /fixture has no GitHub remote.",
		});
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
		expect(ghCalls).toEqual([]);
	});

	test("ordinary GH retains exact payload and gh arguments", async () => {
		seed("https://github.com/Old/Repo.git", "origin", "github");
		ghError = null;
		const result = await caller().content(input);
		expect(result).toEqual({
			number: 7,
			title: "GH",
			body: "",
			url: "https://github.com/Old/Repo/issues/7",
			state: "open",
			author: null,
			createdAt: undefined,
			updatedAt: undefined,
		});
		expect(ghCalls).toEqual([
			[
				"issue",
				"view",
				"7",
				"--repo",
				"Old/Repo",
				"--json",
				"number,title,body,url,state,author,createdAt,updatedAt",
			],
		]);
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});
	test("successful unrecognized custom remote retains legacy secondary GH", async () => {
		seed(undefined, "native", "github");
		remotes.set("origin", "https://github.com/Old/Repo.git");
		respond = () => new Response(null, { status: 404 });
		ghError = null;
		expect((await caller().content(input)).title).toBe("GH");
		expect(ghCalls).toHaveLength(1);
	});
	test("GH error preserves original code and message", async () => {
		seed("https://github.com/Old/Repo.git", "origin", "github");
		ghError = Error("Owned gh failure");
		await expect(caller().content(input)).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch issue #7: Owned gh failure",
		});
	});
}
