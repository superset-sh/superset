import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";

function present<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing owned test fixture");
	return value;
}

const filter = "^GitLab claim fixture:";
const isolatedCwd = `${realpathSync("/tmp")}/superset-${import.meta.path.split("/").at(-1)}`;
if (process.cwd() !== isolatedCwd) {
	mkdirSync(isolatedCwd, { recursive: true });
	test("GitLab claim helper with isolated owned boundaries", () => {
		try {
			execFileSync(
				process.execPath,
				[
					"test",
					"--no-env-file",
					import.meta.path,
					"--test-name-pattern",
					filter,
				],
				{
					env: { PATH: process.env.PATH, TMPDIR: "/tmp" },
					cwd: isolatedCwd,
					timeout: 30000,
					stdio: "pipe",
				},
			);
		} catch (error) {
			const failure = error as { stdout?: Buffer; stderr?: Buffer };
			throw new Error(`${failure.stdout ?? ""}${failure.stderr ?? ""}`);
		}
	});
} else {
	globalThis.fetch = async () => {
		throw new Error("Unexpected unmocked outbound transport");
	};
	const row = {
		id: "ws-owned",
		organizationId: "org-owned",
		name: "workspace",
		provider: "vercel",
		providerSandboxId: "owned-sandbox",
		status: "ready" as const,
		deletedAt: null,
		environmentId: "env-owned",
		baseBranch: "feature/base%name",
		branch: "work/one",
		createdByUserId: "user-owned",
	};
	const config = {
		provider: "gitlab",
		host: "gitlab.example.com",
		groupPath: "group",
		scopeKind: "group",
		scopeId: "7",
		auth: "token",
		webhookSecret: "owned-webhook",
	};
	const binding = () => ({
		connection_id: "conn-owned",
		project_id: "42",
		path_with_namespace: "group/repo",
		clone_url: "https://gitlab.example.com/group/repo.git",
		default_branch: "main",
		workspace_id: row.id,
		organization_id: row.organizationId,
		workspace_name: row.name,
		provider: row.provider,
		provider_sandbox_id: row.providerSandboxId,
		status: row.status,
		deleted_at: null,
		environment_id: row.environmentId,
		base_branch: row.baseBranch,
		branch: row.branch,
		created_by_user_id: row.createdByUserId,
		environment_organization_id: row.organizationId,
		environment_provider: "vercel",
		connection_organization_id: row.organizationId,
		connector: "gitlab",
		owner_kind: "org",
		disconnected_at: null,
		state: { ...config },
		creator_id: row.createdByUserId,
		creator_deleted_at: null,
		creator_name: "Owned User",
		creator_email: "owned@example.com",
		member_user_id: row.createdByUserId,
		member_organization_id: row.organizationId,
		has_github_links: false,
	});
	let current: Record<string, unknown> | null;
	let credentials: Record<string, unknown> | null;
	let metadata: unknown;
	let status: number;
	let hooks: string;
	let hookStatus: number;
	let duringProvider: (() => void) | undefined;
	let credentialCalls: unknown[][];
	let sends: { url: string; headers: Headers }[];
	let queries: string[];
	const { PgDialect } = await import("drizzle-orm/pg-core");
	mock.module("@superset/db/client", () => ({
		dbWs: {
			transaction: () => {
				throw new Error("Unexpected pool");
			},
		},
		db: {
			execute: async (
				query: Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0],
			) => {
				queries.push(new PgDialect().sqlToQuery(query).sql);
				return current ? [{ ...current }] : [];
			},
			transaction: () => {
				throw new Error("Unexpected transaction");
			},
		},
	}));
	mock.module("./connection", () => ({
		gitlabCredentialsFor: async (...args: unknown[]) => {
			credentialCalls.push(args);
			return credentials;
		},
	}));
	const send = async (url: string, init: RequestInit) => {
		sends.push({ url, headers: new Headers(init.headers) });
		if (url.includes("/repository/files/"))
			return new Response(hooks, { status: hookStatus });
		duringProvider?.();
		return new Response(JSON.stringify(metadata), { status });
	};
	mock.module("./transport", () => ({ safeGitLabFetch: send }));
	expect((await import("./transport")).safeGitLabFetch).toBe(send);
	const { resolveGitlabSandboxClaim } = await import("./sandbox-claim");
	beforeEach(() => {
		current = binding();
		credentials = {
			connectionId: "conn-owned",
			organizationId: row.organizationId,
			token: "OWNED_ORG_TOKEN",
			config: { ...config },
		};
		metadata = {
			id: 42,
			path_with_namespace: "group/repo",
			http_url_to_repo: "https://gitlab.example.com/group/repo.git",
			default_branch: "renamed-default",
		};
		status = 200;
		hooks = '{"ports":[3000,8080],"start":["owned"]}';
		hookStatus = 200;
		duringProvider = undefined;
		credentialCalls = [];
		sends = [];
		queries = [];
	});
	const resolve = (withRepoHooks = false) =>
		resolveGitlabSandboxClaim({ row, withRepoHooks });
	test("GitLab claim fixture: physical absence is the only fallback", async () => {
		current = null;
		expect(await resolve()).toBeNull();
		expect(credentialCalls).toEqual([]);
	});
	test("GitLab claim fixture: scoped numeric metadata and encoded hook ref", async () => {
		const result = await resolve(true);
		expect(result?.repository).toEqual({
			provider: "gitlab",
			url: "https://gitlab.example.com/group/repo.git",
			branch: "work/one",
			baseBranch: row.baseBranch,
			path: ".",
			hooks: true,
		});
		expect(result?.author).toEqual({
			name: "Owned User",
			email: "owned@example.com",
		});
		expect(result?.repoHooks?.ports).toEqual([3000, 8080]);
		expect(credentialCalls).toEqual([
			[
				"conn-owned",
				{
					organizationId: "org-owned",
					expected: { host: "gitlab.example.com", projectPath: "group/repo" },
				},
			],
		]);
		expect(sends.map((x) => x.url)).toEqual([
			"https://gitlab.example.com/api/v4/projects/42",
			`https://gitlab.example.com/api/v4/projects/42/repository/files/.superset%2Fconfig.json/raw?ref=${encodeURIComponent(row.baseBranch)}`,
		]);
		expect(
			sends.every(
				(x) => x.headers.get("authorization") === "Bearer OWNED_ORG_TOKEN",
			),
		).toBe(true);
		expect(JSON.stringify(result)).not.toContain("OWNED_ORG_TOKEN");
		await result?.recheck();
		expect(queries).toHaveLength(2);
		expect(queries[0]).toContain("LEFT JOIN");
		expect(queries[0]).not.toContain("FOR UPDATE");
	});
	const invalid: [string, unknown][] = [
		["workspace_id", null],
		["organization_id", "foreign"],
		["provider", "other"],
		["provider_sandbox_id", "changed"],
		["status", "stopped"],
		["deleted_at", new Date()],
		["environment_id", "changed"],
		["base_branch", "changed"],
		["branch", "changed"],
		["created_by_user_id", null],
		["environment_organization_id", "foreign"],
		["environment_provider", "other"],
		["connection_organization_id", "foreign"],
		["connector", "github"],
		["owner_kind", "user"],
		["disconnected_at", new Date()],
		["state", {}],
		["creator_id", null],
		["creator_deleted_at", new Date()],
		["member_user_id", null],
		["member_organization_id", "foreign"],
		["has_github_links", true],
		["project_id", "0"],
		["clone_url", "https://foreign.example.com/group/repo.git"],
	];
	for (const [key, value] of invalid)
		test(`GitLab claim fixture: rejects current ${key} before credentials`, async () => {
			if (current) current[key] = value;
			await expect(resolve()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
			expect(credentialCalls).toEqual([]);
			expect(sends).toEqual([]);
		});
	test("GitLab claim fixture: stale supplied creator rejects", async () => {
		await expect(
			resolveGitlabSandboxClaim({ row: { ...row, createdByUserId: null } }),
		).rejects.toThrow("GitLab sandbox claim is unavailable");
		expect(credentialCalls).toEqual([]);
	});
	for (const change of [
		{ id: 43 },
		{ id: 0 },
		{ path_with_namespace: "group/Repo" },
		{ http_url_to_repo: "https://foreign.example.com/group/repo.git" },
		{ http_url_to_repo: "https://gitlab.example.com:8443/group/repo.git" },
	])
		test(`GitLab claim fixture: rejects current metadata ${JSON.stringify(change)}`, async () => {
			metadata = { ...(metadata as object), ...change };
			await expect(resolve()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
		});
	test("GitLab claim fixture: returned credential scope cannot drift", async () => {
		if (credentials) credentials.config = { ...config, groupPath: "other" };
		await expect(resolve()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		expect(sends).toEqual([]);
	});
	test("GitLab claim fixture: null credentials and provider errors are constant", async () => {
		credentials = null;
		await expect(resolve()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		credentials = {
			connectionId: "conn-owned",
			organizationId: row.organizationId,
			token: "OWNED_ORG_TOKEN",
			config,
		};
		status = 503;
		await expect(resolve()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: missing and invalid hooks remain optional", async () => {
		hookStatus = 404;
		expect((await resolve(true))?.repoHooks).toBeNull();
		hookStatus = 200;
		hooks = "not-json";
		expect((await resolve(true))?.repoHooks).toBeNull();
		hooks = '{"ports":[0]}';
		expect((await resolve(true))?.repoHooks).toBeNull();
		expect((await resolve(false))?.repoHooks).toBeNull();
	});
	test("GitLab claim fixture: transient hooks are not absence", async () => {
		hookStatus = 503;
		await expect(resolve(true)).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: final recheck rejects mutation during provider work", async () => {
		duringProvider = () => {
			if (current) current.disconnected_at = new Date();
		};
		const result = await resolve();
		expect(result).not.toBeNull();
		await expect(present(result).recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: final recheck rejects deletion and project edits", async () => {
		const result = await resolve();
		current = null;
		await expect(present(result).recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		current = binding();
		current.project_id = "43";
		await expect(present(result).recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: token refresh with unchanged grant succeeds", async () => {
		const result = await resolve();
		if (current)
			current.state = {
				...config,
				webhookSecret: "rotated",
				accessToken: "rotated",
			};
		await expect(present(result).recheck()).resolves.toBeUndefined();
	});
	test("GitLab claim fixture: recheck accepts only the unchanged provisioning to ready lifecycle transition", async () => {
		present(current).status = "provisioning";
		const provisioning = { ...row, status: "provisioning" as const };
		const result = present(
			await resolveGitlabSandboxClaim({ row: provisioning }),
		);
		present(current).status = "ready";
		await expect(result.recheck()).resolves.toBeUndefined();
		await expect(
			resolveGitlabSandboxClaim({ row: provisioning }),
		).rejects.toThrow("GitLab sandbox claim is unavailable");
	});
	test("GitLab claim fixture: ready cannot regress to provisioning and transition cannot hide revoked membership", async () => {
		const ready = present(await resolve());
		present(current).status = "provisioning";
		await expect(ready.recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		const provisioning = present(
			await resolveGitlabSandboxClaim({
				row: { ...row, status: "provisioning" },
			}),
		);
		present(current).status = "ready";
		present(current).member_user_id = null;
		await expect(provisioning.recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: selected project scope ID must match stored project", async () => {
		if (current)
			current.state = {
				...config,
				groupPath: "group/repo",
				scopeKind: "project",
				scopeId: "43",
			};
		await expect(resolve()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		expect(credentialCalls).toEqual([]);
	});

	test("GitLab claim fixture: provisioning and selected project scope remain supported", async () => {
		present(current).status = "provisioning";
		present(current).state = {
			...config,
			groupPath: "group/repo",
			scopeKind: "project",
			scopeId: "42",
		};
		present(credentials).config = {
			...config,
			groupPath: "group/repo",
			scopeKind: "project",
			scopeId: "42",
		};
		await expect(
			resolveGitlabSandboxClaim({
				row: { ...row, status: "provisioning", branch: row.baseBranch },
			}),
		).rejects.toThrow("GitLab sandbox claim is unavailable");
		present(current).branch = row.baseBranch;
		expect(
			(
				await resolveGitlabSandboxClaim({
					row: { ...row, status: "provisioning", branch: row.baseBranch },
				})
			)?.repository,
		).toEqual({
			provider: "gitlab",
			url: "https://gitlab.example.com/group/repo.git",
			branch: row.baseBranch,
			path: ".",
			hooks: true,
		});
	});
	for (const change of [
		{ connectionId: "foreign" },
		{ organizationId: "foreign" },
	])
		test(`GitLab claim fixture: returned credential ${Object.keys(change)[0]} must match`, async () => {
			Object.assign(present(credentials), change);
			await expect(resolve()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
			expect(sends).toEqual([]);
		});
	for (const field of [
		"member_user_id",
		"creator_id",
		"connection_id",
		"default_branch",
	] as const)
		test(`GitLab claim fixture: final recheck rejects changed ${field}`, async () => {
			const result = await resolve();
			present(current)[field] = "changed";
			await expect(present(result).recheck()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
		});
	test("GitLab claim fixture: auth failures reading optional hooks reject", async () => {
		hookStatus = 401;
		await expect(resolve(true)).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		hookStatus = 403;
		await expect(resolve(true)).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});

	test("GitLab claim fixture: general server API retains configured HTTPS port", async () => {
		present(current).state = { ...config, host: "gitlab.example.com:8443" };
		present(current).clone_url =
			"https://gitlab.example.com:8443/group/repo.git";
		present(credentials).config = {
			...config,
			host: "gitlab.example.com:8443",
		};
		metadata = {
			...(metadata as object),
			http_url_to_repo: present(current).clone_url,
		};
		expect((await resolve())?.origin).toBe("https://gitlab.example.com:8443");
		expect(sends[0]?.url).toBe(
			"https://gitlab.example.com:8443/api/v4/projects/42",
		);
	});
	test("GitLab claim fixture: provider exceptions never expose raw credential errors", async () => {
		duringProvider = () => {
			throw new Error("OWNED_ORG_TOKEN raw provider error");
		};
		try {
			await resolve();
			throw new Error("Expected denial");
		} catch (error) {
			expect((error as Error).message).toBe(
				"GitLab sandbox claim is unavailable",
			);
		}
	});
	test("GitLab claim fixture: live member author rendering does not establish authority", async () => {
		present(current).creator_name = "";
		expect((await resolve())?.author).toEqual({
			name: "",
			email: "owned@example.com",
		});
		present(current).member_user_id = null;
		await expect(resolve()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: validated ready transition cannot regress to provisioning", async () => {
		present(current).status = "provisioning";
		const result = present(
			await resolveGitlabSandboxClaim({
				row: { ...row, status: "provisioning" },
			}),
		);
		present(current).status = "ready";
		await expect(result.recheck()).resolves.toBeUndefined();
		present(current).status = "provisioning";
		await expect(result.recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("GitLab claim fixture: rejected ready transition cannot latch invalid authority", async () => {
		present(current).status = "provisioning";
		const result = present(
			await resolveGitlabSandboxClaim({
				row: { ...row, status: "provisioning" },
			}),
		);
		present(current).status = "ready";
		present(current).member_user_id = null;
		await expect(result.recheck()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		present(current).status = "provisioning";
		present(current).member_user_id = row.createdByUserId;
		await expect(result.recheck()).resolves.toBeUndefined();
	});
	test("GitLab claim fixture: initial async display naming preserves unchanged authority", async () => {
		present(current).workspace_name = "Generated workspace display name";
		await expect(resolve()).resolves.not.toBeNull();
	});
	test("GitLab claim fixture: later display rename preserves unchanged provisioning authority", async () => {
		present(current).status = "provisioning";
		const result = present(
			await resolveGitlabSandboxClaim({
				row: { ...row, status: "provisioning" },
			}),
		);
		present(current).workspace_name = "Generated workspace display name";
		await expect(result.recheck()).resolves.toBeUndefined();
	});
}
