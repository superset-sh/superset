import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";

function present<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing owned test fixture");
	return value;
}

const filter = "^Central claim fixture:";
const isolatedCwd = `${realpathSync("/tmp")}/superset-${import.meta.path.split("/").at(-1)}`;
if (process.cwd() !== isolatedCwd) {
	mkdirSync(isolatedCwd, { recursive: true });
	test("central claim with isolated owned boundaries", () => {
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
		baseBranch: "main",
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
		creator_name: "Owned Superset User",
		creator_email: "superset@example.com",
		member_user_id: row.createdByUserId,
		member_organization_id: row.organizationId,
		has_github_links: false,
	});
	let current: Record<string, unknown> | null;
	let calls: string[];
	let userToken: string | null;
	let githubAccount: {
		githubUserId: number;
		login: string;
		name: string;
	} | null;
	let installationToken: string | null;
	let hostMutation: (() => void) | undefined;
	let metadata: unknown;
	let agentEnv: Record<string, string>;
	let queries: number;
	let queryError: Error | undefined;
	const settings: Record<string, string | undefined> = {
		NEXT_PUBLIC_API_URL: "https://api.example.com",
		SANDBOX_GATE_SECRET: "owned-gate-secret",
		SENTRY_DSN_SANDBOX: "https://sentry.example.com/owned",
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: "owned-test",
		GITLAB_SANDBOX_OIDC_ISSUER: "https://oidc.vercel.com/owned-team",
		VERCEL_SANDBOX_TOKEN: "OWNED_SANDBOX_TOKEN",
		VERCEL_SANDBOX_TEAM_ID: "owned-team-id",
		VERCEL_SANDBOX_PROJECT_ID: "owned-project-id",
	};
	mock.module("../../env", () => ({ env: settings }));
	mock.module("@superset/db/client", () => ({
		dbWs: {
			transaction: () => {
				throw new Error("Unexpected pool");
			},
		},
		db: {
			execute: async () => {
				queries++;
				if (queryError) throw queryError;
				return current ? [{ ...current }] : [];
			},
			query: {
				users: {
					findFirst: async () => {
						calls.push("creator");
						return {
							name: "Owned Superset User",
							email: "superset@example.com",
						};
					},
				},
			},
			transaction: () => {
				throw new Error("Unexpected transaction");
			},
		},
	}));
	mock.module("../../router/agent-credential", () => ({
		resolveAgentCredentialEnv: async () => {
			calls.push("agent");
			return agentEnv;
		},
	}));
	mock.module("../../router/environment/resolve-environment", () => ({
		resolveEnvironment: async () => {
			calls.push("environment");
			return {
				id: "env-owned",
				provider: "vercel",
				sourceKind: "image",
				sourceRef: "owned-image",
				region: "lhr1",
				bundleSha: "owned-bundle",
				hooksRepositoryId: current ? null : "gh-first",
				envs: {
					PUBLIC_INPUT: "owned-env",
					GITLAB_TOKEN: "UNTRUSTED_ENV_TOKEN",
					GH_TOKEN: "UNTRUSTED_GITHUB_TOKEN",
				},
			};
		},
	}));
	mock.module("../github-user", () => ({
		githubUserTokenFor: async () => {
			calls.push("github-user-token");
			return userToken;
		},
		githubUserConnectionFor: async () => {
			calls.push("github-account");
			return githubAccount;
		},
	}));
	mock.module("./access", () => ({
		sandboxHostSecretFor: async () => {
			calls.push("host-secret");
			hostMutation?.();
			return "owned-host-secret";
		},
	}));
	mock.module("./clone-token", () => ({
		installationOctokit: () => {
			throw new Error("Unexpected provider");
		},
	}));
	const actualRepositories = await import("./repositories");
	const checkouts = [
		{
			repository: {
				id: "gh-first",
				owner: "owned",
				name: "one",
				fullName: "owned/one",
				defaultBranch: "main",
			},
			branch: row.branch,
			baseBranch: row.baseBranch,
			path: "one",
			hooks: true,
		},
		{
			repository: {
				id: "gh-second",
				owner: "owned",
				name: "two",
				fullName: "owned/two",
				defaultBranch: "develop",
			},
			branch: row.branch,
			baseBranch: "develop",
			path: "two",
			hooks: false,
		},
	];
	mock.module("./repositories", () => ({
		...actualRepositories,
		workspaceRepositories: async () => {
			calls.push("github-repositories");
			return checkouts;
		},
		installationTokenFor: async () => {
			calls.push("github-installation");
			return installationToken;
		},
	}));
	mock.module("../gitlab/connection", () => ({
		gitlabCredentialsFor: async () => {
			calls.push("gitlab-credentials");
			return {
				connectionId: "conn-owned",
				organizationId: row.organizationId,
				token: "OWNED_ORG_TOKEN",
				config: current?.state ?? config,
			};
		},
	}));
	const send = async (url: string) => {
		calls.push(url);
		return Response.json(
			url.includes("/repository/files/") ? { ports: [3000, 8080] } : metadata,
		);
	};
	mock.module("../gitlab/transport", () => ({ safeGitLabFetch: send }));
	expect((await import("../gitlab/transport")).safeGitLabFetch).toBe(send);
	globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
		calls.push(String(input));
		return Response.json({ ports: [4567] });
	};
	const installedPlugins = [
		{
			marketplace: "superset",
			name: "owned-plugin",
			version: "1.0.0",
			enabled: true,
		},
	];
	mock.module("./plugins", () => ({
		creatorPlugins: async (userId: string | null) =>
			userId ? installedPlugins : [],
	}));
	const { buildSandboxClaim } = await import("./claim");
	const build = (
		withRepoHooks = false,
		changes: Record<string, unknown> = {},
	) =>
		buildSandboxClaim({
			row: { ...row, ...changes } as unknown as Parameters<
				typeof buildSandboxClaim
			>[0]["row"],
			withRepoHooks,
			launch: {
				agent: "codex",
				prompt: "owned prompt",
				model: "owned-model",
				effort: "high",
				mode: "plan",
				attachmentFileIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
			},
		});
	beforeEach(() => {
		current = binding();
		calls = [];
		userToken = "OWNED_GITHUB_TOKEN";
		githubAccount = {
			githubUserId: 7,
			login: "owned",
			name: "Owned GitHub User",
		};
		installationToken = "OWNED_INSTALLATION_TOKEN";
		hostMutation = undefined;
		metadata = {
			id: 42,
			path_with_namespace: "group/repo",
			http_url_to_repo: "https://gitlab.example.com/group/repo.git",
			default_branch: "main",
		};
		agentEnv = {
			OPENAI_API_KEY: "OWNED_MODEL_TOKEN",
			Z_EXTRA: "owned-agent-input",
		};
		queries = 0;
		queryError = undefined;
		settings.GITLAB_SANDBOX_OIDC_ISSUER = "https://oidc.vercel.com/owned-team";
		settings.GITLAB_SANDBOX_PROXY_URL = undefined;
	});
	test("Central claim fixture: GitLab handoff retains repository author hooks inputs and digest", async () => {
		const result = await build(true);
		expect(result.claim).toHaveProperty("requireFreshPolicy", true);
		expect(result.claim.identity.SUPERSET_SANDBOX_PLUGINS).toBe(
			JSON.stringify(installedPlugins),
		);
		expect(result.repositories).toEqual([
			{
				provider: "gitlab",
				url: "https://gitlab.example.com/group/repo.git",
				branch: "work/one",
				baseBranch: "main",
				path: ".",
				hooks: true,
			},
		]);
		expect(result.claim.ports).toEqual([3000, 8080]);
		expect(result.claim.managedEnv).toMatchObject({
			PUBLIC_INPUT: "owned-env",
			GIT_AUTHOR_NAME: "Owned Superset User",
			GIT_AUTHOR_EMAIL: "superset@example.com",
			GITLAB_TOKEN: "proxy-injected-see-network-routing",
			GITLAB_HOST: "gitlab.example.com",
			GIT_PROTOCOL: "https",
			OPENAI_API_KEY: "proxy-injected-see-network-routing",
		});
		expect(result.claim.networkPolicy).toMatchObject({
			allow: {
				"gitlab.example.com": [
					{ forwardURL: "https://api.example.com/api/gitlab/proxy" },
				],
				"*": [],
			},
		});
		expect(result.claim.identity).toMatchObject({
			SUPERSET_SANDBOX_IMAGE_TAG: "owned-image",
			SUPERSET_BUNDLE_SHA: "owned-bundle",
			SUPERSET_SANDBOX_WORKSPACE_ID: "ws-owned",
			SUPERSET_SANDBOX_ORGANIZATION_ID: "org-owned",
			SUPERSET_SANDBOX_CREATOR_USER_ID: "user-owned",
			SUPERSET_SANDBOX_AGENT: "codex",
			SUPERSET_SANDBOX_AGENT_MODEL: "owned-model",
			SUPERSET_SANDBOX_AGENT_ATTACHMENTS:
				"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			HOST_SERVICE_SENTRY_ENVIRONMENT: "owned-test",
		});
		expect(result.claim.identity.SUPERSET_SANDBOX_REPOSITORIES).toBe(
			JSON.stringify(result.repositories),
		);
		expect(result.environment).toEqual({
			sourceKind: "image",
			sourceRef: "owned-image",
			region: "lhr1",
		});
		expect(result.claim.hostSecret).toBe("owned-host-secret");
		expect(result.agentCredentialDigest).toBe(
			createHmac("sha256", "owned-gate-secret")
				.update(
					'agent-credentials:[["OPENAI_API_KEY","OWNED_MODEL_TOKEN"],["Z_EXTRA","owned-agent-input"]]',
				)
				.digest("hex"),
		);
		expect(JSON.stringify(result)).not.toContain("OWNED_ORG_TOKEN");
		expect(calls.filter((x) => x.startsWith("github"))).toEqual([]);
		expect(queries).toBe(2);
	});
	test("Central claim fixture: configured standalone forwarding endpoint reaches actual GL policy", async () => {
		settings.GITLAB_SANDBOX_PROXY_URL =
			"https://proxy.example.com/mounted/gitlab";
		const result = await build();
		expect(result.claim.networkPolicy).toMatchObject({
			allow: {
				"gitlab.example.com": [
					{ forwardURL: settings.GITLAB_SANDBOX_PROXY_URL },
				],
			},
		});
		expect(JSON.stringify(result.claim.identity)).not.toContain(
			"OWNED_SANDBOX_TOKEN",
		);
		expect(JSON.stringify(result.claim.managedEnv)).not.toContain(
			"OWNED_SANDBOX_TOKEN",
		);
	});
	for (const [name, value] of [
		["GITLAB_SANDBOX_OIDC_ISSUER", undefined],
		["GITLAB_SANDBOX_OIDC_ISSUER", "https://untrusted.example.test/team"],
		["GITLAB_SANDBOX_PROXY_URL", "https://proxy.example.test/%2e%2e/other"],
		["GITLAB_SANDBOX_PROXY_URL", "https://gitlab.example.com/api/gitlab/proxy"],
	] as const)
		test(`Central claim fixture: unavailable GL forwarding configuration rejects ${name} ${value}`, async () => {
			settings[name] = value;
			await expect(build()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
			expect(calls).not.toContain("environment");
			expect(calls).not.toContain("agent");
			expect(calls).not.toContain("host-secret");
		});
	test("Central claim fixture: disabled GL proxy does not alter GitHub claims", async () => {
		current = null;
		settings.GITLAB_SANDBOX_OIDC_ISSUER = undefined;
		settings.GITLAB_SANDBOX_PROXY_URL = "invalid";
		const result = await build();
		expect(
			result.repositories.every((repo) => repo.provider === undefined),
		).toBe(true);
		expect(result.claim).not.toHaveProperty("requireFreshPolicy");
	});
	test("Central claim fixture: no binding preserves GitHub repository token author hooks and plugins", async () => {
		current = null;
		const result = await build(true);
		expect(result.claim.identity.SUPERSET_SANDBOX_PLUGINS).toBe(
			JSON.stringify(installedPlugins),
		);
		expect(result.claim).not.toHaveProperty("requireFreshPolicy");
		expect(result.repositories).toEqual([
			{
				url: "https://github.com/owned/one.git",
				branch: "work/one",
				baseBranch: "main",
				path: "one",
				hooks: true,
			},
			{
				url: "https://github.com/owned/two.git",
				branch: "work/one",
				baseBranch: "develop",
				path: "two",
			},
		]);
		expect(result.claim.identity.SUPERSET_SANDBOX_CREATOR_USER_ID).toBe(
			row.createdByUserId,
		);
		expect(result.claim.ports).toEqual([4567]);
		expect(result.claim.managedEnv.GIT_AUTHOR_NAME).toBe("Owned GitHub User");
		expect(result.claim.managedEnv.GIT_AUTHOR_EMAIL).toBe(
			"7+owned@users.noreply.github.com",
		);
		expect(result.claim.networkPolicy).toMatchObject({
			allow: {
				"api.github.com": [
					{
						transform: [
							{ headers: { Authorization: "Bearer OWNED_GITHUB_TOKEN" } },
						],
					},
				],
			},
		});
		expect(calls).toEqual([
			"environment",
			"agent",
			"github-repositories",
			"github-user-token",
			"github-account",
			"creator",
			"https://api.github.com/repos/owned/one/contents/.superset/config.json?ref=main",
			"host-secret",
		]);
		expect(result.claim.managedEnv).not.toHaveProperty("GITLAB_TOKEN");
	});
	test("Central claim fixture: GitHub installation and public token fallback retained", async () => {
		current = null;
		userToken = null;
		expect((await build()).claim.networkPolicy).toMatchObject({
			allow: {
				"api.github.com": [
					{
						transform: [
							{ headers: { Authorization: "Bearer OWNED_INSTALLATION_TOKEN" } },
						],
					},
				],
			},
		});
		installationToken = null;
		expect((await build()).claim.managedEnv).not.toHaveProperty("GH_TOKEN");
	});
	test("Central claim fixture: GitHub null creator author and empty digest retained", async () => {
		current = null;
		const result = await build(false, { createdByUserId: null });
		expect(result.claim.identity).not.toHaveProperty(
			"SUPERSET_SANDBOX_CREATOR_USER_ID",
		);
		expect(result.claim.managedEnv.GIT_AUTHOR_NAME).toBe("Superset");
		expect(result.agentCredentialDigest).toBe(
			createHmac("sha256", "owned-gate-secret")
				.update("agent-credentials:[]")
				.digest("hex"),
		);
		expect(calls).not.toContain("agent");
	});
	for (const change of [
		{ connection_organization_id: "foreign" },
		{ owner_kind: "user" },
		{ disconnected_at: new Date() },
		{ created_by_user_id: null },
		{ creator_deleted_at: new Date() },
		{ member_user_id: null },
		{ has_github_links: true },
	])
		test(`Central claim fixture: physical invalid binding cannot fall back ${Object.keys(change)[0]}`, async () => {
			Object.assign(present(current), change);
			await expect(build()).rejects.toThrow(
				"GitLab sandbox claim is unavailable",
			);
			expect(calls).toEqual([]);
		});
	test("Central claim fixture: last host-secret await cannot return stale GitLab grant", async () => {
		hostMutation = () => {
			if (current) current.disconnected_at = new Date();
		};
		await expect(build()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
		expect(calls.at(-1)).toBe("host-secret");
	});
	test("Central claim fixture: service collision rejects cloud forwarding", async () => {
		agentEnv = {
			OPENAI_API_KEY: "OWNED_MODEL_TOKEN",
			OPENAI_BASE_URL: "https://gitlab.example.com",
		};
		await expect(build()).rejects.toThrow("GitLab cloud forwarding conflicts");
	});
	test("Central claim fixture: digest is sorted and changes with creator inputs", async () => {
		const first = await build();
		agentEnv = {
			Z_EXTRA: "owned-agent-input",
			OPENAI_API_KEY: "OWNED_MODEL_TOKEN",
		};
		expect((await build()).agentCredentialDigest).toBe(
			first.agentCredentialDigest,
		);
		agentEnv.OPENAI_API_KEY = "CHANGED_MODEL_TOKEN";
		expect((await build()).agentCredentialDigest).not.toBe(
			first.agentCredentialDigest,
		);
	});
	test("Central claim fixture: GitLab binding appearing during GitHub work rejects", async () => {
		current = null;
		hostMutation = () => {
			current = binding();
		};
		await expect(build()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("Central claim fixture: live automation owner keeps Superset author", async () => {
		present(current).creator_name = "Automation Owner";
		present(current).creator_email = "automation@example.com";
		const result = await build();
		expect(result.claim.managedEnv.GIT_AUTHOR_NAME).toBe("Automation Owner");
		expect(result.claim.managedEnv.GIT_AUTHOR_EMAIL).toBe(
			"automation@example.com",
		);
	});

	test("Central claim fixture: cloud forwarding rejects a custom HTTPS port", async () => {
		present(current).state = { ...config, host: "gitlab.example.com:8443" };
		present(current).clone_url =
			"https://gitlab.example.com:8443/group/repo.git";
		metadata = {
			...(metadata as object),
			http_url_to_repo: present(current).clone_url,
		};
		await expect(build()).rejects.toThrow(
			"Invalid GitLab cloud forwarding configuration",
		);
	});
	test("Central claim fixture: final absence query failures reject", async () => {
		current = null;
		hostMutation = () => {
			queryError = new Error("owned DB boundary failure");
		};
		await expect(build()).rejects.toThrow(
			"GitLab sandbox claim is unavailable",
		);
	});
	test("Central claim fixture: GitHub disconnected account retains Superset author", async () => {
		current = null;
		githubAccount = null;
		userToken = null;
		const result = await build();
		expect(result.claim.managedEnv.GIT_AUTHOR_NAME).toBe("Owned Superset User");
		expect(result.claim.managedEnv.GIT_AUTHOR_EMAIL).toBe(
			"superset@example.com",
		);
	});
	const ownedSdk = {
		get: async () => ({
			stop: async () => {
				calls.push("sdk:stop");
			},
		}),
	};
	mock.module("@vercel/sandbox", () => ({
		APIError: class extends Error {},
		Sandbox: ownedSdk,
	}));
	expect((await import("@vercel/sandbox")).Sandbox).toBe(ownedSdk);
	const { settleSandbox } = await import("./vercel");
	test("Central claim fixture: actual required settle accepts ready transition and ordinary current grant refresh", async () => {
		present(current).status = "provisioning";
		const result = await build(false, { status: "provisioning" });
		present(current).status = "ready";
		expect(typeof result.claim.recheckPolicy).toBe("function");
		expect(JSON.stringify(result.claim)).not.toContain("recheckPolicy");
		globalThis.fetch = Object.assign(
			async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				if (
					String(input) === "https://owned-sandbox.invalid/trpc/health.check"
				) {
					present(current).state = {
						...config,
						webhookSecret: "new-webhook",
						accessToken: "new-ciphertext",
					};
					calls.push("settle:health");
					return new Response("ok");
				}
				if (
					String(input) ===
						"https://owned-sandbox.invalid/trpc/sandbox.setEnvironment" &&
					init?.method === "POST"
				) {
					calls.push("settle:env");
					expect(String(init.body)).not.toContain("OWNED_ORG_TOKEN");
					return new Response("ok");
				}
				throw new Error("Unexpected outbound fetch");
			},
			{ preconnect: () => {} },
		);
		await settleSandbox({
			providerSandboxId: row.providerSandboxId,
			hostTarget: "https://owned-sandbox.invalid",
			claim: result.claim,
		});
		expect(calls.slice(-2)).toEqual(["settle:health", "settle:env"]);
		expect(calls).not.toContain("sdk:stop");
	});
	for (const field of ["member_user_id", "connection_id"] as const)
		test(`Central claim fixture: actual required settle rejects ${field} change during health before env push`, async () => {
			present(current).status = "provisioning";
			const result = await build(false, { status: "provisioning" });
			present(current).status = "ready";
			globalThis.fetch = Object.assign(
				async (input: Parameters<typeof fetch>[0]) => {
					if (
						String(input) !== "https://owned-sandbox.invalid/trpc/health.check"
					)
						throw new Error("Unexpected env push or outbound fetch");
					present(current)[field] = "changed";
					calls.push("settle:health");
					return new Response("ok");
				},
				{ preconnect: () => {} },
			);
			await expect(
				settleSandbox({
					providerSandboxId: row.providerSandboxId,
					hostTarget: "https://owned-sandbox.invalid",
					claim: result.claim,
				}),
			).rejects.toThrow("Sandbox policy update failed");
			expect(calls.slice(-2)).toEqual(["settle:health", "sdk:stop"]);
		});
}
