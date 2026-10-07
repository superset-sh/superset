import { beforeEach, expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { TRPCError } from "@trpc/server";

if (process.env.GITLAB_OPTIONS_PROOF_CHILD !== "1") {
	test("GitLab option callers run with isolated cleared mocks", () => {
		const result = spawnSync(
			process.execPath,
			["--no-env-file", "test", import.meta.path],
			{
				env: { PATH: process.env.PATH ?? "", GITLAB_OPTIONS_PROOF_CHILD: "1" },
				encoding: "utf8",
				timeout: 20_000,
			},
		);
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
	});
} else {
	const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const foreignId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
	const connectionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
	const host = "git.fixture.invalid:8443";
	const path = "Team/Sub/App";
	const cloneUrl = `https://${host}/${path}.git`;
	let enabled: boolean | undefined;
	let memberOrganizations: string[];
	let exists: boolean;
	let available: boolean;
	let wrongTenant: boolean;
	let config: {
		provider: "gitlab";
		host: string;
		groupPath: string;
		scopeKind: "group";
		auth: "token";
		webhookSecret: string;
	};
	let lookup: string[];
	let credentialCalls: {
		id: string;
		options: {
			organizationId?: string;
			expected?: { host: string; projectPath?: string };
		};
	}[];
	let requests: { origin: string; token: string; path: string }[];
	let featureCalls: number;
	let fetchResult: (requestedPath: string) => Response;
	let membershipQueries: number;
	mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
	mock.module("../../env", () => ({ env: {} }));
	const fakeDb = {
		query: {
			members: {
				findMany: async () => {
					membershipQueries++;
					return memberOrganizations.map((organizationId) => ({
						organizationId,
					}));
				},
			},
			users: { findFirst: async () => ({ email: "fixture@example.invalid" }) },
		},
	};
	mock.module("@superset/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
	mock.module("../../lib/analytics", () => ({
		posthog: {
			capture: () => {},
			isFeatureEnabled: async () => {
				featureCalls++;
				return enabled;
			},
		},
	}));
	const { readGitlabConfig } = await import("../../lib/gitlab/config");
	const { gitlabScopeAllows } = await import("../../lib/gitlab/scope");
	mock.module("../../lib/gitlab/connection", () => ({
		readGitlabConfig,
		gitlabConnectionForOrg: async (organization: string) => {
			lookup.push(organization);
			return exists ? { id: connectionId, state: config } : null;
		},
		gitlabCredentialsFor: async (
			id: string,
			options: {
				organizationId?: string;
				expected?: { host: string; projectPath?: string };
			} = {},
		) => {
			credentialCalls.push({ id, options });
			if (
				!available ||
				options.organizationId !== organizationId ||
				(options.expected &&
					(options.expected.host !== config.host ||
						(options.expected.projectPath !== undefined &&
							!gitlabScopeAllows(config, options.expected.projectPath))))
			)
				return null;
			return {
				connectionId: id,
				organizationId: wrongTenant ? foreignId : organizationId,
				token: "FIXTURE_TOKEN",
				config: { ...config },
			};
		},
	}));
	const api = await import("../../lib/gitlab/api");
	mock.module("../../lib/gitlab/api", () => ({
		...api,
		gitlabApiFetch: async (
			origin: string,
			token: string,
			requestedPath: string,
		) => {
			requests.push({ origin, token, path: requestedPath });
			return fetchResult(requestedPath);
		},
	}));
	const { createTRPCRouter } = await import("../../trpc");
	const { gitlabOptionsRouter } = await import("./gitlab-options");
	const router = createTRPCRouter({
		cloudWorkspace: createTRPCRouter(gitlabOptionsRouter),
	});
	function context(bearer = true, session = false) {
		return {
			headers: new Headers(
				bearer ? { authorization: "Bearer FIXTURE_JWT" } : {},
			),
			session: session
				? {
						user: { id: "fixture-user", email: "fixture@example.invalid" },
						session: { activeOrganizationId: organizationId },
					}
				: null,
			auth: {
				api: {
					verifyJWT: async () => ({
						payload: {
							sub: "fixture-user",
							organizationIds: memberOrganizations,
						},
					}),
				},
			},
			client: null,
			agentCaller: null,
			sandboxCaller: null,
		} as unknown as Parameters<typeof router.createCaller>[0];
	}
	const projects = () => ({ organizationId });
	const branches = () => ({ organizationId, cloneUrl });
	const metadata = () => ({
		id: 83,
		path_with_namespace: path,
		http_url_to_repo: cloneUrl,
		default_branch: "Release/Current",
	});
	beforeEach(() => {
		enabled = true;
		memberOrganizations = [organizationId];
		exists = true;
		available = true;
		wrongTenant = false;
		config = {
			provider: "gitlab",
			host,
			groupPath: "Team/Sub",
			scopeKind: "group",
			auth: "token",
			webhookSecret: "FIXTURE",
		};
		lookup = [];
		credentialCalls = [];
		requests = [];
		featureCalls = 0;
		membershipQueries = 0;
		fetchResult = (requestedPath) =>
			requestedPath.startsWith("/groups/")
				? Response.json([metadata()], { headers: { "x-next-page": "2" } })
				: requestedPath.includes("/repository/branches?")
					? Response.json([{ name: "feature" }], {
							headers: { "x-next-page": "3" },
						})
					: Response.json(metadata());
	});
	test("unauthenticated calls are refused before cloud, connection or provider", async () => {
		const caller = router.createCaller(context(false));
		for (const run of [
			() => caller.cloudWorkspace.listGitlabProjects(projects()),
			() => caller.cloudWorkspace.listGitlabBranches(branches()),
		])
			await expect(run()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect([
			featureCalls,
			lookup.length,
			credentialCalls.length,
			requests.length,
		]).toEqual([0, 0, 0, 0]);
	});
	test("cloud denied or unavailable and foreign members cause zero connection and credential requests", async () => {
		for (const gate of [false, undefined, true]) {
			enabled = gate;
			memberOrganizations = gate === true ? [foreignId] : [organizationId];
			const caller = router.createCaller(context());
			await expect(
				caller.cloudWorkspace.listGitlabProjects(projects()),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				caller.cloudWorkspace.listGitlabBranches(branches()),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		expect([lookup.length, credentialCalls.length, requests.length]).toEqual([
			0, 0, 0,
		]);
	});
	test("a rejected JWT cannot use a live session, while expired verification retains session fallback", async () => {
		const rejected = context(true, true);
		rejected.auth.api.verifyJWT = async () => {
			throw new TRPCError({ code: "UNAUTHORIZED", message: "fixture revoked" });
		};
		await expect(
			router
				.createCaller(rejected)
				.cloudWorkspace.listGitlabProjects(projects()),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "fixture revoked",
		});
		expect([lookup.length, membershipQueries]).toEqual([0, 0]);
		const fallback = context(true, true);
		fallback.auth.api.verifyJWT = async () => {
			throw new Error("fixture expired");
		};
		expect(
			(
				await router
					.createCaller(fallback)
					.cloudWorkspace.listGitlabProjects(projects())
			).items,
		).toHaveLength(1);
		expect(membershipQueries).toBe(1);
	});
	test("sandbox callers retain the current allowlist boundary", async () => {
		const ctx = context();
		ctx.sandboxCaller = {
			workspaceId: "fixture-workspace",
			organizationId,
			userId: "fixture-user",
		};
		await expect(
			router.createCaller(ctx).cloudWorkspace.listGitlabProjects(projects()),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect([featureCalls, lookup.length, requests.length]).toEqual([0, 0, 0]);
	});
	test("old project defaults, output and selected custom-port pagination remain", async () => {
		const result = await router
			.createCaller(context())
			.cloudWorkspace.listGitlabProjects(projects());
		expect(result).toEqual({
			items: [
				{
					connectionId,
					projectId: "83",
					pathWithNamespace: path,
					cloneUrl,
					defaultBranch: "Release/Current",
				},
			],
			nextPage: 2,
		});
		expect(lookup).toEqual([organizationId]);
		expect(credentialCalls).toEqual([
			{ id: connectionId, options: { organizationId } },
		]);
		expect(requests[0]?.origin).toBe(`https://${host}`);
		expect(
			new URL(`https://fixture.invalid${requests[0]?.path}`).searchParams.get(
				"page",
			),
		).toBe("1");
	});
	test("no project connection is empty while unusable or wrong-tenant credentials preserve reconnect precondition", async () => {
		const caller = router.createCaller(context());
		exists = false;
		expect(await caller.cloudWorkspace.listGitlabProjects(projects())).toEqual({
			items: [],
			nextPage: null,
		});
		expect(credentialCalls).toEqual([]);
		exists = true;
		for (const foreign of [false, true]) {
			available = foreign;
			wrongTenant = foreign;
			await expect(
				caller.cloudWorkspace.listGitlabProjects(projects()),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				message: "Reconnect GitLab to clone this project",
				cause: { i18nKey: "serverError.cloudWorkspace.reconnectGitLab" },
			});
		}
		expect(requests).toEqual([]);
	});
	test("released page and query bounds reject before connection access", async () => {
		const caller = router.createCaller(context());
		for (const invalid of [
			{ page: 0 },
			{ page: 10001 },
			{ page: 1.5 },
			{ query: "a".repeat(201) },
		]) {
			await expect(
				caller.cloudWorkspace.listGitlabProjects({ ...projects(), ...invalid }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				caller.cloudWorkspace.listGitlabBranches({ ...branches(), ...invalid }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect([lookup.length, requests.length]).toEqual([0, 0]);
	});
	test("branches bind fresh credentials to the resolved exact host/project and retain default branch and pagination", async () => {
		const result = await router
			.createCaller(context())
			.cloudWorkspace.listGitlabBranches({
				...branches(),
				query: "feature",
				page: 2,
			});
		expect(result).toEqual({
			defaultBranch: "Release/Current",
			items: [{ name: "feature" }],
			nextPage: 3,
		});
		expect(credentialCalls).toHaveLength(2);
		for (const call of credentialCalls)
			expect(call).toMatchObject({
				id: connectionId,
				options: { organizationId, expected: { host, projectPath: path } },
			});
		expect(
			requests.every(
				(request) =>
					request.origin === `https://${host}` &&
					request.token === "FIXTURE_TOKEN",
			),
		).toBe(true);
		expect(requests[1]?.path).toContain(
			"/projects/Team%2FSub%2FApp/repository/branches?",
		);
		expect(
			new URL(`https://fixture.invalid${requests[1]?.path}`).searchParams.get(
				"page",
			),
		).toBe("2");
	});
	test("foreign branch host/scope rejects before credentials and preserves direct clone reasons", async () => {
		const caller = router.createCaller(context());
		await expect(
			caller.cloudWorkspace.listGitlabBranches({
				organizationId,
				cloneUrl: `https://git.fixture.invalid/${path}.git`,
			}),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "That URL is not on the connected GitLab host",
			cause: { reason: "host" },
		});
		await expect(
			caller.cloudWorkspace.listGitlabBranches({
				organizationId,
				cloneUrl: `https://${host}/Team/Submarine/App.git`,
			}),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "GitLab could not find that project",
			cause: { reason: "project" },
		});
		expect([credentialCalls.length, requests.length]).toEqual([0, 0]);
	});
	test("branch resolution retains the direct missing-token error", async () => {
		available = false;
		await expect(
			router
				.createCaller(context())
				.cloudWorkspace.listGitlabBranches(branches()),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Reconnect GitLab to clone this project",
			cause: { reason: "token" },
		});
		expect(requests).toEqual([]);
	});
	test("a scope change after clone metadata cannot invoke branch transport", async () => {
		fetchResult = () => {
			config = { ...config, groupPath: "Other" };
			return Response.json(metadata());
		};
		await expect(
			router
				.createCaller(context())
				.cloudWorkspace.listGitlabBranches(branches()),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "Reconnect GitLab to clone this project",
			cause: { i18nKey: "serverError.cloudWorkspace.reconnectGitLab" },
		});
		expect(requests).toHaveLength(1);
		expect(credentialCalls[1]?.options).toEqual({
			organizationId,
			expected: { host, projectPath: path },
		});
	});
}
