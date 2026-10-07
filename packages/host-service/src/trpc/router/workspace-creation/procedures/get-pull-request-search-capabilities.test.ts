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

if (process.env.SUPERSET_CAPABILITIES_FIXTURE !== "capabilities") {
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
						SUPERSET_CAPABILITIES_FIXTURE: "capabilities",
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
		return workspaceCreationRouter.createCaller(ctx);
	}

	test("resolves exact current GitLab remote and exposes native rules support without credentials", async () => {
		seed("gl", "https://gitlab.com/Old/Widget.git", "native");
		remotes
			.get("/fixture/gl")
			?.set("native", "https://git.example.invalid:8443/Group/Sub/Widget.git");
		respond = (url) =>
			Response.json(
				url.pathname === "/api/v4/version"
					? { version: "18.0.0", revision: "abcdef123456" }
					: [{ id: 1, approvals_required: 2 }],
			);
		const rows = await caller().getPullRequestSearchCapabilities({
			projectIds: ["gl"],
		});
		expect(rows).toMatchObject([
			{
				projectId: "gl",
				provider: "gitlab",
				host: "git.example.invalid:8443",
				projectPath: "Group/Sub/Widget",
				reviewSemantics: "current-cycle",
				teamReviewRequests: false,
				approvalRules: "available",
			},
		]);
		expect(
			requests.some(
				(url) =>
					url.pathname ===
					"/api/v4/projects/Group%2FSub%2FWidget/approval_rules",
			),
		).toBe(true);
		expect(
			tokenHosts.every((host) => host === "git.example.invalid:8443"),
		).toBe(true);
		expect(JSON.stringify(rows)).not.toContain("fixture-scoped-token");
		expect(ghRequests).toHaveLength(0);
	});
	test("keeps GitHub metadata and capabilities without provider or contributor APIs", async () => {
		seed("gh", "https://github.com/Team/Widget.git");
		expect(
			await caller().getPullRequestSearchCapabilities({ projectIds: ["gh"] }),
		).toMatchObject([
			{
				projectId: "gh",
				provider: "github",
				host: "github.com",
				projectPath: "Team/Widget",
				reviewSemantics: "history",
				teamReviewRequests: true,
				approvalRules: "available",
			},
		]);
		expect(requests).toHaveLength(0);
		expect(tokenHosts).toHaveLength(0);
		expect(ghRequests).toHaveLength(0);
	});
	test("treats edition404 as unsupported and does not invent rule counts", async () => {
		seed();
		respond = () => new Response(null, { status: 404 });
		expect(
			await caller().getPullRequestSearchCapabilities({ projectIds: ["gl"] }),
		).toMatchObject([{ provider: "gitlab", approvalRules: "unavailable" }]);
	});
	test.each([
		401, 403, 429, 503,
	])("keeps native status %i visible as unknown capability", async (status) => {
		seed();
		respond = () => new Response(null, { status });
		const codes: Record<number, string> = {
			401: "UNAUTHORIZED",
			403: "FORBIDDEN",
			429: "TOO_MANY_REQUESTS",
			503: "SERVICE_UNAVAILABLE",
		};
		expect(
			await caller().getPullRequestSearchCapabilities({ projectIds: ["gl"] }),
		).toMatchObject([
			{
				provider: "gitlab",
				approvalRules: "unknown",
				error: { code: codes[status] },
			},
		]);
		expect(ghRequests).toHaveLength(0);
	});
	test.each([
		{},
		[{ id: -1, approvals_required: 1 }],
		[{ id: 1, approvals_required: -1 }],
		null,
	])("does not convert malformed rules into available %j", async (body) => {
		seed();
		respond = () => Response.json(body);
		expect(
			await caller().getPullRequestSearchCapabilities({ projectIds: ["gl"] }),
		).toMatchObject([
			{
				provider: "gitlab",
				approvalRules: "unknown",
				error: { code: "SERVICE_UNAVAILABLE" },
			},
		]);
	});
	test("keeps missing credentials visible without a provider request", async () => {
		seed();
		token = null;
		expect(
			await caller().getPullRequestSearchCapabilities({ projectIds: ["gl"] }),
		).toMatchObject([
			{
				provider: "gitlab",
				approvalRules: "unknown",
				error: { code: "PRECONDITION_FAILED" },
			},
		]);
		expect(requests).toHaveLength(0);
	});
	test("retains one missing-project error alongside successful native metadata", async () => {
		seed();
		expect(
			await caller().getPullRequestSearchCapabilities({
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
	test("deduplicates selected projects and rejects oversized input before resolution", async () => {
		seed();
		expect(
			await caller().getPullRequestSearchCapabilities({
				projectIds: ["gl", "gl"],
			}),
		).toHaveLength(1);
		requests = [];
		await expect(
			caller().getPullRequestSearchCapabilities({
				projectIds: Array.from({ length: 101 }, (_, i) => String(i)),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(requests).toHaveLength(0);
	});
	test("caps concurrent native capability requests at four", async () => {
		for (let i = 0; i < 9; i++) seed(String(i));
		let active = 0;
		let maximum = 0;
		globalThis.fetch = Object.assign(
			async () => {
				active++;
				maximum = Math.max(maximum, active);
				await new Promise((resolve) => setTimeout(resolve, 1));
				active--;
				return Response.json([]);
			},
			{ preconnect: originalFetch.preconnect },
		);
		expect(
			await caller().getPullRequestSearchCapabilities({
				projectIds: Array.from({ length: 9 }, (_, i) => String(i)),
			}),
		).toHaveLength(9);
		expect(maximum).toBe(4);
	});
}
