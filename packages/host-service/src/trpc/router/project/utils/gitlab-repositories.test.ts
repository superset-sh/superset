import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { HostServiceContext } from "../../../../types";

if (process.env.SUPERSET_GITLAB_REPOSITORIES_FIXTURE !== "1") {
	test("native repository listing uses isolated actual router callers", () => {
		const cwd = mkdtempSync("/tmp/superset-native-repositories-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_GITLAB_REPOSITORIES_FIXTURE: "1",
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
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({ config: () => ({ parsed: {} }) }));
	let environment: Record<string, string>;
	mock.module("../../../../terminal/clean-shell-env", () => ({
		getToolEnvironment: async () => environment,
		getStrictShellEnvironment: async () => environment,
		augmentPathForMacOS: () => "",
		buildMinimalEnv: () => environment,
		parseEnvOutput: () => environment,
		clearStrictShellEnvCache() {},
	}));
	let ghRequests: string[][] = [];
	mock.module("../../workspace-creation/utils/exec-gh", () => ({
		execGh: async (args: string[]) => {
			ghRequests.push(args);
			return [
				{
					full_name: "Owner/Repo",
					clone_url: "https://github.com/Owner/Repo.git",
				},
			];
		},
	}));
	const { projectRouter } = await import("../project");
	const module = () => import("./gitlab-repositories");
	const HOST = "git.example.invalid:8443";
	const TOKEN = "owned-fixture-only";
	const originalFetch = globalThis.fetch;
	let token: string | null;
	let tokenHosts: string[];
	let requests: { url: URL; init?: RequestInit }[];
	let respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
	const credentials = {
		getToken: async (host: string) => {
			tokenHosts.push(host);
			return token;
		},
	};
	const row = (id = 1, path = `Group/Sub/Repo-${id}`) => ({
		id,
		path_with_namespace: path,
		http_url_to_repo: `https://${HOST}/${path}.git`,
	});
	const context = (authenticated = true): HostServiceContext =>
		({
			isAuthenticated: authenticated,
			credentials,
		}) as unknown as HostServiceContext;
	beforeEach(() => {
		environment = { GITLAB_HOST: HOST };
		token = TOKEN;
		tokenHosts = [];
		ghRequests = [];
		requests = [];
		respond = () => Response.json([row()], { headers: { "x-next-page": "" } });
		globalThis.fetch = Object.assign(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					typeof input === "string"
						? input
						: input instanceof URL
							? input.href
							: input.url,
				);
				requests.push({ url, init });
				return respond(url, init);
			},
			{ preconnect() {} },
		);
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
		delete process.env.SUPERSET_HOST_RUN_MODE;
	});
	test("unchanged actual GitHub caller retains its original listing arguments and array", async () => {
		expect(
			await projectRouter.createCaller(context()).listGitHubRepositories(),
		).toEqual([
			{ fullName: "Owner/Repo", cloneUrl: "https://github.com/Owner/Repo.git" },
		]);
		expect(ghRequests).toEqual([
			[
				"api",
				"--method",
				"GET",
				"user/repos",
				"-f",
				"affiliation=owner,collaborator,organization_member",
				"-f",
				"sort=updated",
				"-f",
				"per_page=100",
				"-f",
				"page=1",
				"--jq",
				"map({full_name, clone_url})",
			],
		]);
		expect(tokenHosts).toEqual([]);
		expect(requests).toEqual([]);
	});
	test("actual legacy no-body caller preserves bare array and nested custom-port clone", async () => {
		const result = await projectRouter
			.createCaller(context())
			.listGitLabRepositories();
		expect(result).toEqual([
			{ fullName: "Group/Sub/Repo-1", cloneUrl: row().http_url_to_repo },
		]);
		expect(tokenHosts).toEqual([HOST]);
		expect(requests[0]?.url.origin).toBe(`https://${HOST}`);
		expect(requests[0]?.init?.redirect).toBe("error");
		expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
			`Bearer ${TOKEN}`,
		);
		expect(Object.fromEntries(requests[0]?.url.searchParams ?? [])).toEqual({
			membership: "true",
			order_by: "last_activity_at",
			sort: "desc",
			simple: "true",
			per_page: "100",
			page: "1",
		});
	});
	test("canonical authority case is insensitive while native namespace case is retained", async () => {
		const cloneUrl = `https://GIT.EXAMPLE.INVALID:8443/Group/Sub/Repo-1.git`;
		respond = () => Response.json([{ ...row(), http_url_to_repo: cloneUrl }]);
		expect(
			await projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: "GIT.EXAMPLE.INVALID:8443" }),
		).toEqual({
			repositories: [{ fullName: "Group/Sub/Repo-1", cloneUrl }],
			nextPage: null,
		});
		expect(tokenHosts).toEqual([HOST]);
	});
	test("actual explicit caller ignores legacy environment and returns provider-native page two", async () => {
		environment = { GITLAB_HOST: "foreign.example.invalid" };
		const result = await projectRouter
			.createCaller(context())
			.listGitLabRepositoriesForHost({
				host: `https://${HOST}`,
				page: 2,
				search: "Sub Repo",
			});
		expect(result).toEqual({
			repositories: [
				{ fullName: "Group/Sub/Repo-1", cloneUrl: row().http_url_to_repo },
			],
			nextPage: null,
		});
		expect(tokenHosts).toEqual([HOST]);
		expect(requests[0]?.url.searchParams.get("page")).toBe("2");
		expect(requests[0]?.url.searchParams.get("search")).toBe("Sub Repo");
	});
	test("legacy pages beyond100 use one captured credential despite backing replacement", async () => {
		respond = (url) => {
			token = "changed-after-first-page";
			return Response.json(
				url.searchParams.get("page") === "1"
					? Array.from({ length: 100 }, (_, i) => row(i + 1))
					: [row(101)],
			);
		};
		const result = await projectRouter
			.createCaller(context())
			.listGitLabRepositories();
		expect(result).toHaveLength(101);
		expect(tokenHosts).toEqual([HOST]);
		expect(
			requests.map((r) => new Headers(r.init?.headers).get("authorization")),
		).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]);
	});
	test.each([
		401, 403, 429, 500,
	])("actual native HTTP %s remains typed and redacted", async (status) => {
		respond = () => new Response(`provider echoed ${TOKEN}`, { status });
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST }),
		).rejects.toMatchObject({
			code:
				status === 401
					? "PRECONDITION_FAILED"
					: status === 403
						? "FORBIDDEN"
						: status === 429
							? "TOO_MANY_REQUESTS"
							: "BAD_GATEWAY",
		});
		try {
			await projectRouter.createCaller(context()).listGitLabRepositories();
		} catch (error) {
			expect(String(error)).not.toContain(TOKEN);
		}
	});
	test("missing exact-host token refuses before transport", async () => {
		token = null;
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(requests).toEqual([]);
	});
	test("both actual endpoints preserve authentication and machine boundary", async () => {
		await expect(
			projectRouter.createCaller(context(false)).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(tokenHosts).toEqual([]);
	});
	test.each([
		"git.example.invalid/path",
		"http://git.example.invalid",
		"https://user:password@git.example.invalid",
		"git.example.invalid:65536",
		"git.example.invalid?token=secret",
		"github.com",
	])("explicit invalid authority %s refuses before credentials", async (host) => {
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(tokenHosts).toEqual([]);
	});
	test.each([0, 101, 1.5])("explicit page %s stays bounded", async (page) => {
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST, page }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(requests).toEqual([]);
	});
	test.each([
		"0",
		"1",
		"bogus",
		"1.5",
		"9007199254740992",
	])("bad next-page %s cannot become partial success", async (next) => {
		respond = () =>
			Response.json([row()], { headers: { "x-next-page": next } });
		await expect(
			projectRouter.createCaller(context()).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});
	test("page100 with more data refuses instead of returning misleading continuation", async () => {
		respond = () =>
			Response.json([row()], { headers: { "x-next-page": "101" } });
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST, page: 100 }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
	test("legacy100-page ceiling throws and never returns partial10000", async () => {
		respond = (url) =>
			Response.json(
				Array.from({ length: 100 }, (_, i) =>
					row(Number(url.searchParams.get("page")) * 100 + i),
				),
				{
					headers: {
						"x-next-page": String(Number(url.searchParams.get("page")) + 1),
					},
				},
			);
		await expect(
			projectRouter.createCaller(context()).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(requests).toHaveLength(100);
		expect(tokenHosts).toEqual([HOST]);
	});
	test.each([
		null,
		{},
		[{ ...row(), id: 0 }],
		[{ ...row(), path_with_namespace: "Group/../Repo" }],
		[
			{
				...row(),
				http_url_to_repo:
					"https://foreign.example.invalid/Group/Sub/Repo-1.git",
			},
		],
		[
			{
				...row(),
				http_url_to_repo: `https://user:secret@${HOST}/Group/Sub/Repo-1.git`,
			},
		],
		[{ ...row(), http_url_to_repo: `${row().http_url_to_repo}?token=secret` }],
	])("malformed or mismatched project %j refuses", async (body) => {
		respond = () => Response.json(body);
		await expect(
			projectRouter.createCaller(context()).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});
	test("a malformed later page rejects the whole legacy list without partial success", async () => {
		respond = (url) =>
			Response.json(
				url.searchParams.get("page") === "1"
					? Array.from({ length: 100 }, (_, i) => row(i + 1))
					: [
							{
								...row(101),
								http_url_to_repo:
									"https://foreign.example.invalid/Group/Sub/Repo-101.git",
							},
						],
			);
		await expect(
			projectRouter.createCaller(context()).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		expect(requests).toHaveLength(2);
		expect(tokenHosts).toEqual([HOST]);
	});
	test("a page larger than100 rows refuses instead of discarding excess", async () => {
		respond = () =>
			Response.json(Array.from({ length: 101 }, (_, i) => row(i + 1)));
		await expect(
			projectRouter
				.createCaller(context())
				.listGitLabRepositoriesForHost({ host: HOST }),
		).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});
	test("large response body refuses rather than draining without limit", async () => {
		respond = () => new Response(" ".repeat(2 * 1024 * 1024 + 1));
		await expect(
			projectRouter.createCaller(context()).listGitLabRepositories(),
		).rejects.toMatchObject({ code: "BAD_GATEWAY" });
	});
	test("late credential completion after deadline cannot dispatch provider", async () => {
		const { listGitLabRepositoriesForHost } = await module();
		await expect(
			listGitLabRepositoriesForHost(
				{
					getToken: async () => {
						await new Promise((resolve) => setTimeout(resolve, 20));
						return TOKEN;
					},
				},
				{ host: HOST },
				{ timeoutMs: 5 },
			),
		).rejects.toMatchObject({ code: "TIMEOUT" });
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(requests).toEqual([]);
	});
	test("transport deadline aborts stalled fetch", async () => {
		const { listGitLabRepositoriesForHost } = await module();
		const state: { signal?: AbortSignal | null } = {};
		respond = (_url, init) => {
			state.signal = init?.signal;
			return new Promise<Response>(() => {});
		};
		await expect(
			listGitLabRepositoriesForHost(
				credentials,
				{ host: HOST },
				{ timeoutMs: 5 },
			),
		).rejects.toMatchObject({ code: "TIMEOUT" });
		expect(state.signal?.aborted).toBe(true);
	});
	test("legacy authority metadata preserves explicit env precedence and provenance", async () => {
		const { resolveLegacyGitLabHost } = await module();
		expect(
			await resolveLegacyGitLabHost({
				environment: async () => ({ GITLAB_HOST: `https://${HOST}` }),
				readGlobalHost: async () => {
					throw Error("must not read glab");
				},
			}),
		).toEqual({ host: HOST, source: "env:GITLAB_HOST" });
	});
	test.each([
		"GITLAB_URI",
		"GL_HOST",
	])("legacy supported %s alias retains exact-host provenance", async (name) => {
		const { resolveLegacyGitLabHost } = await module();
		expect(
			await resolveLegacyGitLabHost({
				environment: async () => ({ [name]: HOST }),
				readGlobalHost: async () => {
					throw Error("must not read glab");
				},
			}),
		).toEqual({ host: HOST, source: `env:${name}` });
	});
	test("legacy global getter is metadata only with documented public default", async () => {
		const { resolveLegacyGitLabHost } = await module();
		expect(
			await resolveLegacyGitLabHost({
				environment: async () => ({}),
				readGlobalHost: async () => HOST,
			}),
		).toEqual({ host: HOST, source: "glab-default" });
		expect(
			await resolveLegacyGitLabHost({
				environment: async () => ({}),
				readGlobalHost: async () => "",
			}),
		).toEqual({ host: "gitlab.com", source: "documented-public-default" });
	});
	test("legacy metadata timeout remains a redacted typed timeout", async () => {
		const { resolveLegacyGitLabHost } = await module();
		await expect(
			resolveLegacyGitLabHost({
				environment: async () => ({}),
				readGlobalHost: async () => {
					throw Object.assign(Error(TOKEN), {
						killed: true,
						signal: "SIGTERM",
					});
				},
			}),
		).rejects.toMatchObject({ code: "TIMEOUT" });
	});
	test("invalid or missing legacy getter never guesses foreign authority", async () => {
		const { resolveLegacyGitLabHost } = await module();
		for (const readGlobalHost of [
			async () => "not a host",
			async () => {
				throw Object.assign(Error(TOKEN), { code: "ENOENT" });
			},
		]) {
			await expect(
				resolveLegacyGitLabHost({
					environment: async () => ({}),
					readGlobalHost,
				}),
			).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		}
	});
}
