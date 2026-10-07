import { beforeEach, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

if (process.env.TEST_GITLAB_SANDBOX_BINDING_FIXTURE !== "1") {
	test("live binding fake-boundary proof runs in a cleared isolated process", async () => {
		const child = Bun.spawn(
			[process.execPath, "test", "--no-env-file", import.meta.path],
			{
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: process.env.TMPDIR ?? "/tmp",
					TEST_GITLAB_SANDBOX_BINDING_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, status] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (status !== 0) throw new Error(stdout + stderr);
		console.log(stderr.trim());
		expect(status).toBe(0);
	});
} else {
	globalThis.fetch = async () => {
		throw new Error("NETWORK_NOT_ALLOWED");
	};
	const configuration = {
		VERCEL_SANDBOX_TOKEN: "FAKE_SERVER_TOKEN",
		VERCEL_SANDBOX_TEAM_ID: "team_test",
		VERCEL_SANDBOX_PROJECT_ID: "prj_test",
	};
	const identity = {
		teamId: configuration.VERCEL_SANDBOX_TEAM_ID,
		projectId: configuration.VERCEL_SANDBOX_PROJECT_ID,
		sandboxName: "ws-test",
		sandboxId: "session_current",
	};
	const initial = {
		workspace_id: "00000000-0000-4000-8000-000000000001",
		organization_id: "00000000-0000-4000-8000-000000000002",
		environment_id: "00000000-0000-4000-8000-000000000003",
		connection_id: "00000000-0000-4000-8000-000000000004",
		provider: "vercel",
		provider_sandbox_id: identity.sandboxName,
		status: "ready",
		deleted_at: null,
		created_by_user_id: "00000000-0000-4000-8000-000000000005",
		has_membership: true,
		base_branch: "main",
		working_branch: "superset/workspace",
		project_id: "7",
		path_with_namespace: "Team/Widget",
		clone_url: "https://gl.example.test/Team/Widget.git",
		default_branch: "main",
		connection_organization_id: "00000000-0000-4000-8000-000000000002",
		connector: "gitlab",
		owner_kind: "org",
		disconnected_at: null,
		state: {
			provider: "gitlab",
			host: "gl.example.test",
			groupPath: "Team",
			scopeKind: "group",
			scopeId: "10",
			auth: "token",
			webhookSecret: "FAKE_WEBHOOK_SECRET",
		},
		has_github_checkout: false,
	};
	let row: Record<string, unknown> | null = structuredClone(initial);
	let provider = {
		name: identity.sandboxName,
		status: "running",
		currentSession: () => ({ sessionId: identity.sandboxId }),
	};
	let afterLookup = () => {};
	let lookup: (() => Promise<typeof provider>) | undefined;
	let databaseLookup: (() => Promise<unknown[]>) | undefined;
	const queries: { sql: string; params: unknown[] }[] = [];
	const execute = mock(
		async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
			queries.push(new PgDialect().sqlToQuery(query));
			if (databaseLookup) return databaseLookup();
			return row ? [structuredClone(row)] : [];
		},
	);
	const get = mock(async (_args: Record<string, unknown>) => {
		const result = lookup ? await lookup() : provider;
		afterLookup();
		return result;
	});
	mock.module("@superset/db/client", () => ({
		db: { execute },
		dbWs: { execute },
	}));
	mock.module("@vercel/sandbox", () => ({ Sandbox: { get } }));
	mock.module("../../env", () => ({ env: configuration }));
	if ((await import("@vercel/sandbox")).Sandbox.get !== get) {
		throw new Error("OWNED_SANDBOX_MOCK_NOT_INSTALLED");
	}
	const { loadGitlabSandboxBinding } = await import("./sandbox-binding");
	beforeEach(() => {
		row = structuredClone(initial);
		provider = {
			name: identity.sandboxName,
			status: "running",
			currentSession: () => ({ sessionId: identity.sandboxId }),
		};
		afterLookup = () => {};
		lookup = undefined;
		databaseLookup = undefined;
		queries.length = 0;
		execute.mockClear();
		get.mockClear();
	});
	test("a current provider session resolves only its stored checkout without secrets", async () => {
		const binding = await loadGitlabSandboxBinding(identity);
		expect(binding.scope).toEqual({
			organizationId: initial.organization_id,
			workspaceId: initial.workspace_id,
			connectionId: initial.connection_id,
			providerTeamId: identity.teamId,
			providerProjectId: identity.projectId,
			sandboxId: identity.sandboxId,
			sandboxName: identity.sandboxName,
			projectId: 7,
			projectPath: "Team/Widget",
			origin: "https://gl.example.test",
		});
		expect(binding.baseBranch).toBe("main");
		expect(binding.workingBranch).toBe("superset/workspace");
		expect(binding.fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(binding)).not.toContain("FAKE_");
		expect(get).toHaveBeenCalledTimes(1);
		expect(get.mock.calls[0]?.[0]).toMatchObject({
			token: configuration.VERCEL_SANDBOX_TOKEN,
			teamId: identity.teamId,
			projectId: identity.projectId,
			name: identity.sandboxName,
			resume: false,
		});
		expect(get.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
		expect(queries).toHaveLength(2);
		for (const query of queries) {
			expect(query.params).toContain(identity.sandboxName);
			expect(query.sql).not.toContain(identity.sandboxName);
			expect(query.sql).toContain('FROM "auth"."members" m');
		}
	});
	test("wrong provider tenant or project rejects before database or provider work", async () => {
		for (const changed of [
			{ ...identity, teamId: "team_other" },
			{ ...identity, projectId: "prj_other" },
		])
			await expect(loadGitlabSandboxBinding(changed)).rejects.toThrow();
		expect(execute).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	});
	test("missing, revoked, mixed or stale physical bindings cannot select credentials", async () => {
		for (const changed of [
			null,
			{ ...initial, provider: "other" },
			{ ...initial, provider_sandbox_id: "ws-other" },
			{ ...initial, status: "failed" },
			{ ...initial, status: "deleted" },
			{ ...initial, deleted_at: new Date() },
			{ ...initial, connector: "github" },
			{ ...initial, owner_kind: "user" },
			{ ...initial, connection_organization_id: "foreign" },
			{ ...initial, disconnected_at: new Date() },
			{ ...initial, has_github_checkout: true },
			{ ...initial, has_membership: false },
			{ ...initial, created_by_user_id: null, has_membership: false },
			{ ...initial, project_id: "8e0" },
			{ ...initial, clone_url: "https://other.test/Team/Widget.git" },
			{ ...initial, path_with_namespace: "team/Widget" },
			{ ...initial, state: { ...initial.state, groupPath: "Other" } },
		]) {
			row = changed;
			await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		}
		expect(get).not.toHaveBeenCalled();
	});
	test("automation owners and provisioning bindings remain supported", async () => {
		row = { ...initial, status: "provisioning" };
		expect((await loadGitlabSandboxBinding(identity)).scope.workspaceId).toBe(
			initial.workspace_id,
		);
	});
	test("signed stale session, wrong name and stopped provider reject", async () => {
		for (const changed of [
			{
				...provider,
				currentSession: () => ({ sessionId: "session_previous" }),
			},
			{ ...provider, name: "ws-other" },
			{ ...provider, status: "stopped" },
		]) {
			provider = changed;
			await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		}
	});
	test("current parent and connection changes during lookup reject", async () => {
		for (const change of [
			{ organization_id: "foreign" },
			{ environment_id: "other" },
			{ connection_id: "other" },
			{ project_id: "8" },
			{ base_branch: "release" },
			{ working_branch: "other" },
			{ created_by_user_id: null, has_membership: false },
			{ state: { ...initial.state, webhookSecret: "CHANGED" } },
		]) {
			row = structuredClone(initial);
			afterLookup = () => {
				row = { ...initial, ...change };
			};
			await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		}
	});
	test("credential ciphertext refresh and canonical config key order do not revoke scope", async () => {
		afterLookup = () => {
			row = {
				...initial,
				access_token: "FAKE_REFRESHED_CIPHERTEXT",
				token_expires_at: new Date(),
				state: Object.fromEntries(Object.entries(initial.state).reverse()),
			};
		};
		expect((await loadGitlabSandboxBinding(identity)).scope.projectId).toBe(7);
	});
	test("cancellation before lookup starts neither boundary", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			loadGitlabSandboxBinding(identity, { signal: controller.signal }),
		).rejects.toThrow();
		expect(execute).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	});
	test("cancelled or deadline-expired provider lookup cannot yield a late binding", async () => {
		let release!: (value: typeof provider) => void;
		lookup = () =>
			new Promise((resolve) => {
				release = resolve;
			});
		const controller = new AbortController();
		const pending = loadGitlabSandboxBinding(identity, {
			signal: controller.signal,
		});
		for (let i = 0; i < 10 && !get.mock.calls.length; i++)
			await Promise.resolve();
		expect(get).toHaveBeenCalledTimes(1);
		controller.abort();
		await expect(pending).rejects.toThrow();
		release(provider);
		await Promise.resolve();
		expect(queries).toHaveLength(1);
		await expect(
			loadGitlabSandboxBinding(identity, { timeoutMs: 5 }),
		).rejects.toThrow();
		release(provider);
	});
	test("provider and database errors use constant diagnostics", async () => {
		lookup = async () => {
			throw Error("FAKE_SERVER_TOKEN private provider error");
		};
		await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow(
			"GitLab sandbox binding is unavailable",
		);
	});

	test("project-scoped numeric identity must agree before provider lookup", async () => {
		row = {
			...initial,
			state: {
				...initial.state,
				scopeKind: "project",
				groupPath: "Team/Widget",
				scopeId: "8",
			},
		};
		await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		expect(get).not.toHaveBeenCalled();
		row = {
			...initial,
			state: {
				...initial.state,
				scopeKind: "project",
				groupPath: "Team/Widget",
				scopeId: "7",
			},
		};
		expect((await loadGitlabSandboxBinding(identity)).scope.projectId).toBe(7);
	});
	test("cancellation before a queued first boundary prevents dispatch", async () => {
		const controller = new AbortController();
		const pending = loadGitlabSandboxBinding(identity, {
			signal: controller.signal,
		});
		controller.abort();
		await expect(pending).rejects.toThrow();
		expect(execute).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	});
	test("first and second stalled database reads obey the whole-operation deadline", async () => {
		let release!: (value: unknown[]) => void;
		databaseLookup = () =>
			new Promise((resolve) => {
				release = resolve;
			});
		await expect(
			loadGitlabSandboxBinding(identity, { timeoutMs: 5 }),
		).rejects.toThrow();
		expect(get).not.toHaveBeenCalled();
		release([structuredClone(initial)]);
		await Promise.resolve();
		expect(get).not.toHaveBeenCalled();
		databaseLookup = () =>
			queries.length === 3
				? new Promise((resolve) => {
						release = resolve;
					})
				: Promise.resolve([structuredClone(initial)]);
		await expect(
			loadGitlabSandboxBinding(identity, { timeoutMs: 5 }),
		).rejects.toThrow();
		expect(get).toHaveBeenCalledTimes(1);
		release([structuredClone(initial)]);
		await Promise.resolve();
		expect(queries).toHaveLength(3);
	});
	test("invalid time budgets reject before boundary work", async () => {
		for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 60001])
			await expect(
				loadGitlabSandboxBinding(identity, { timeoutMs }),
			).rejects.toThrow();
		expect(execute).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	});
	test("a valid provisioning-to-ready transition keeps the same checkout", async () => {
		row = { ...initial, status: "provisioning" };
		afterLookup = () => {
			row = structuredClone(initial);
		};
		expect((await loadGitlabSandboxBinding(identity)).scope.projectId).toBe(7);
	});
	test("revoked creator membership, raw grant generation and absent session reject", async () => {
		for (const change of [
			{ has_membership: false },
			{ state: { ...initial.state, generationTag: "new" } },
		]) {
			row = structuredClone(initial);
			afterLookup = () => {
				row = { ...initial, ...change };
			};
			await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		}
		row = structuredClone(initial);
		afterLookup = () => {};
		provider.currentSession = () => {
			throw Error("FAKE_SERVER_TOKEN missing session");
		};
		await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow(
			"GitLab sandbox binding is unavailable",
		);
	});
	test("database errors and ambiguous rows never dispatch provider work", async () => {
		databaseLookup = async () => {
			throw Error("FAKE_DATABASE_SECRET");
		};
		await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow(
			"GitLab sandbox binding is unavailable",
		);
		databaseLookup = async () => [initial, initial];
		await expect(loadGitlabSandboxBinding(identity)).rejects.toThrow();
		expect(get).not.toHaveBeenCalled();
	});
}
