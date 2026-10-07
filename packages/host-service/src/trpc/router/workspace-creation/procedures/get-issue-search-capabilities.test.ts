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

if (process.env.SUPERSET_ISSUE_CAPABILITIES_FIXTURE !== "issues") {
	test("search capabilities run with isolated selected-remote boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-capabilities-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ISSUE_CAPABILITIES_FIXTURE: "issues",
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
	let activeWorkers = 0,
		maximumWorkers = 0;
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
				activeWorkers++;
				maximumWorkers = Math.max(maximumWorkers, activeWorkers);
				await new Promise((resolve) => setTimeout(resolve, 1));
				activeWorkers--;
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
	const { workspaceCreationRouter } = await import("../workspace-creation");
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
		activeWorkers = 0;
		maximumWorkers = 0;
		respond = (url) => {
			if (url.pathname === "/api/v4/version")
				return new Response(null, { status: 404 });
			return Response.json([], {
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
	function caller(isAuthenticated = true) {
		const ctx = {
			db,
			isAuthenticated,
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
		return workspaceCreationRouter.createCaller(ctx);
	}

	test("native issue metadata resolves selected current custom-port subgroup without approval or contributor APIs", async () => {
		seed("gl", "https://gitlab.com/Old/Widget.git", "native");
		remotes
			.get("/fixture/gl")
			?.set("native", "https://git.example.invalid:8443/Group/Sub/Widget.git");
		respond = (url) => {
			if (url.pathname !== "/api/v4/version")
				throw Error("Issue metadata must not probe approval rules");
			return Response.json({ version: "18.0.0", revision: "abcdef123456" });
		};
		expect(
			await caller().getIssueSearchCapabilities({ projectIds: ["gl"] }),
		).toEqual([
			{
				projectId: "gl",
				provider: "gitlab",
				host: "git.example.invalid:8443",
				projectPath: "Group/Sub/Widget",
			},
		]);
		expect(tokenHosts).toHaveLength(0);
		expect(ghRequests).toHaveLength(0);
	});
	test("GitHub identity preserves default without API or credentials", async () => {
		seed("gh", "https://github.com/Team/Widget.git");
		expect(
			await caller().getIssueSearchCapabilities({ projectIds: ["gh"] }),
		).toEqual([
			{
				projectId: "gh",
				provider: "github",
				host: "github.com",
				projectPath: "Team/Widget",
			},
		]);
		expect(requests).toHaveLength(0);
		expect(tokenHosts).toHaveLength(0);
		expect(ghRequests).toHaveLength(0);
	});
	test("missing live project remains unknown beside an independently resolved native project", async () => {
		seed();
		expect(
			await caller().getIssueSearchCapabilities({
				projectIds: ["missing", "gl"],
			}),
		).toMatchObject([
			{
				projectId: "missing",
				provider: null,
				error: { code: "PRECONDITION_FAILED" },
			},
			{ projectId: "gl", provider: "gitlab" },
		]);
	});
	test("selected remote failure has visible unknown cause and no GitHub fallback", async () => {
		seed();
		workerError = new Error("Fixture worker outage");
		expect(
			await caller().getIssueSearchCapabilities({ projectIds: ["gl"] }),
		).toMatchObject([{ provider: null, error: { code: "BAD_REQUEST" } }]);
		expect(ghRequests).toHaveLength(0);
	});
	test("deduplication and100-project input cap precede resolution", async () => {
		seed();
		expect(
			await caller().getIssueSearchCapabilities({ projectIds: ["gl", "gl"] }),
		).toHaveLength(1);
		await expect(
			caller().getIssueSearchCapabilities({
				projectIds: Array.from({ length: 101 }, (_, i) => String(i)),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(requests).toHaveLength(0);
	});
	test("live issue identity fanout uses at most four selected workers", async () => {
		for (let i = 0; i < 9; i++) seed(String(i));
		expect(
			await caller().getIssueSearchCapabilities({
				projectIds: Array.from({ length: 9 }, (_, i) => String(i)),
			}),
		).toHaveLength(9);
		expect(maximumWorkers).toBe(4);
	});
	test("anonymous callers cannot read live selected repository metadata", async () => {
		seed();
		await expect(
			caller(false).getIssueSearchCapabilities({ projectIds: ["gl"] }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(requests).toHaveLength(0);
		expect(tokenHosts).toHaveLength(0);
	});
}
