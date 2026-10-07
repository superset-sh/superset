import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { cloudWorkspaces } from "@superset/db/schema";
import type { SandboxClaim } from "../../lib/sandbox/vercel";

if (process.env.SUPERSET_POLICY_FIXTURE !== "promote") {
	test("actual environment promote policy caller in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-promote-policy-");
		try {
			execFileSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_POLICY_FIXTURE: "promote",
					},
					stdio: "pipe",
					timeout: 10000,
				},
			);
		} catch (error) {
			const failure = error as { stdout?: Buffer; stderr?: Buffer };
			throw new Error(`${failure.stdout ?? ""}${failure.stderr ?? ""}`);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected outbound fetch");
		},
		{ preconnect: () => {} },
	);
	const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
	const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
	const envId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
	const project = {
		connectionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
		projectId: "42",
		pathWithNamespace: "group/repo",
		cloneUrl: "https://gitlab.invalid/group/repo.git",
		defaultBranch: "main",
	};
	const workspace: typeof cloudWorkspaces.$inferSelect = {
		id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
		organizationId: org,
		name: "Owned workspace",
		branch: "work/one",
		baseBranch: "main",
		provider: "vercel",
		providerSandboxId: "owned-source",
		sandboxUrl: null,
		status: "ready",
		visibility: "org",
		environmentId: envId,
		hostVersion: null,
		bootAgentCredentialDigest: null,
		agentStatus: null,
		agentStatusAt: null,
		prompt: null,
		description: null,
		projectId: null,
		deletedAt: null,
		createdByUserId: user,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	let calls: string[];
	let gl: boolean;
	let failUpdate: number;
	let updates: number;
	let failPersistence: boolean;
	let transactions: number;
	let committed: boolean;
	let goldenName: string;
	let goldenOptions: Record<string, unknown>;
	let saved: Record<string, unknown>;
	mock.module("../../env", () => ({
		env: {
			VERCEL_SANDBOX_TOKEN: "FAKE_PROVIDER_TOKEN",
			VERCEL_SANDBOX_TEAM_ID: "owned-team",
			VERCEL_SANDBOX_PROJECT_ID: "owned-project",
		},
	}));
	mock.module("../../lib/analytics", () => ({ posthog: { capture() {} } }));
	mock.module("../../lib/sandbox/api-credential", () => ({
		SANDBOX_ALLOWED_PROCEDURES: new Set<string>(),
	}));
	mock.module("../../lib/cloud-guards", () => ({
		assertCloudAccess: async () => {},
		assertMember: () => {},
	}));
	mock.module("../cloud-workspace/access", () => ({
		loadVisibleWorkspace: async () => workspace,
	}));
	mock.module("./secrets", () => ({ secretsRouter: {} }));
	mock.module("./secrets/utils/crypto", () => ({
		encryptSecret: (value: string) => value,
		decryptSecret: (value: string) => value,
	}));
	mock.module("../../lib/gitlab/checkout", () => ({
		loadGitlabCheckout: async () => (gl ? project : null),
	}));
	mock.module("../../lib/gitlab/consumer-storage", () => ({
		lockGitlabConsumerEnvironment: async () => {},
		lockGitlabConsumerWorkspace: async () => {
			calls.push("lock-workspace");
		},
		rejectMixedGitlabConsumer: () => {
			throw new Error("Mixed binding");
		},
		requireAbsentGitlabConsumerBinding: async () => {},
		requireSameGitlabConsumerBinding: (left: unknown, right: unknown) => {
			expect(left).toEqual(right);
		},
		resolveGitlabConsumerProject: async () => project,
	}));

	const { getTableName } = await import("drizzle-orm");
	const database = {
		query: {
			environments: {
				findFirst: async () => ({
					id: envId,
					organizationId: org,
					provider: "vercel",
					scope: "organization",
					sourceKind: "image",
					sourceRef: "owned-image",
					region: "lhr1",
					bundleSha: null,
					hooksRepositoryId: null,
				}),
			},
		},
		select: () => ({ from: () => ({ where: async () => [] }) }),
		insert: (table: Parameters<typeof getTableName>[0]) => ({
			values: (values: Record<string, unknown>) => {
				calls.push(`insert:${getTableName(table)}`);
				saved = values;
				return { returning: async () => [values] };
			},
		}),
		delete: () => ({ where: async () => {} }),
		transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
			calls.push("transaction");
			transactions++;
			if (failPersistence) throw new Error("Owned persistence failure");
			const result = await callback(database);
			committed = true;
			return result;
		},
	};
	mock.module("@superset/db/client", () => ({ db: database, dbWs: database }));
	const actualEnvProject = await import("../../lib/gitlab/environment-project");
	mock.module("../../lib/gitlab/environment-project", () => ({
		...actualEnvProject,
		loadGitlabEnvironmentProject: async () => null,
		setGitlabEnvironmentProject: async () => {
			calls.push("bind-environment");
		},
	}));
	class FakeAPIError extends Error {
		response = { status: 404 };
	}
	class OwnedSandbox {
		status = "running";
		currentSnapshotId = "before";
		region = "lhr1";
		vcpus = 8;
		constructor(readonly role: string) {}
		async update() {
			calls.push(`${this.role}:policy`);
			if (++updates === failUpdate)
				throw new Error("FAKE_PROVIDER_TOKEN private policy response");
		}
		async snapshot() {
			calls.push("snapshot");
			this.status = "stopped";
			return { snapshotId: "owned-snapshot" };
		}
		async stop() {
			calls.push(`${this.role}:stop`);
			this.status = "stopped";
			this.currentSnapshotId = "after";
		}
		async writeFiles() {
			calls.push("source:identity");
			this.status = "running";
		}
		async runCommand(options: { cmd: string }) {
			calls.push(options.cmd === "rm" ? "strip" : "boot");
			this.status = "running";
		}
		async delete() {
			calls.push("golden:delete");
		}
		domain() {
			return "https://owned-sandbox.invalid";
		}
	}
	let source: OwnedSandbox;
	let golden: OwnedSandbox;
	const sdk = {
		get: async ({ name, resume }: { name: string; resume: boolean }) => {
			expect(resume).toBe(false);
			return name === "owned-source" ? source : golden;
		},
		create: async (options: Record<string, unknown>) => {
			calls.push("golden:create");
			goldenName = String(options.name);
			goldenOptions = options;
			return golden;
		},
	};
	mock.module("@vercel/sandbox", () => ({
		APIError: FakeAPIError,
		Sandbox: sdk,
	}));
	expect((await import("@vercel/sandbox")).Sandbox).toBe(sdk);
	const adapter = await import("../../lib/sandbox/vercel");
	const claim: SandboxClaim = {
		identity: {
			SUPERSET_SANDBOX_CONTRACT: "1",
			SUPERSET_API_URL: "https://api.invalid",
			SUPERSET_SANDBOX_WORKSPACE_ID: workspace.id,
			SUPERSET_SANDBOX_ORGANIZATION_ID: org,
			SUPERSET_SANDBOX_REPOSITORIES: "[]",
			SUPERSET_SANDBOX_IMAGE_TAG: "owned-image",
			SUPERSET_SANDBOX_PROVIDER: "vercel",
		},
		hostSecret: "OWNED_HOST_SECRET",
		managedEnv: {},
		networkPolicy: {
			allow: {
				"gitlab.invalid": [
					{ forwardURL: "https://api.invalid/api/gitlab/proxy" },
				],
			},
		},
	};
	mock.module("../../lib/sandbox", () => ({
		...adapter,
		buildSandboxClaim: async () => {
			calls.push("claim");
			return {
				claim: {
					...claim,
					...(gl
						? { requireFreshPolicy: true, recheckPolicy: async () => {} }
						: {}),
				},
			};
		},
		RepositoryError: class extends Error {},
		loadRepositories: async () => [],
		primaryRepository: () => null,
		sortRepositories: (rows: unknown[]) => rows,
		workspaceRepositories: async () => [
			{
				repository: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
				hooks: true,
			},
		],
	}));
	const { createTRPCRouter } = await import("../../trpc");
	const { environmentRouter } = await import("./environment");
	const router = createTRPCRouter({
		environment: createTRPCRouter(environmentRouter),
	});
	const caller = () =>
		router.createCaller({
			headers: new Headers({ authorization: "Bearer OWNED_FAKE_JWT" }),
			session: null,
			auth: {
				api: {
					verifyJWT: async () => ({
						payload: { sub: user, organizationIds: [org] },
					}),
				},
			},
			client: null,
			agentCaller: null,
			sandboxCaller: null,
		} as unknown as Parameters<typeof router.createCaller>[0]);
	beforeEach(() => {
		calls = [];
		gl = true;
		failUpdate = 1;
		updates = 0;
		failPersistence = false;
		transactions = 0;
		committed = false;
		goldenName = "";
		goldenOptions = {};
		saved = {};
		source = new OwnedSandbox("source");
		golden = new OwnedSandbox("golden");
		globalThis.fetch = Object.assign(
			async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				const url = String(input);
				if (url === "https://owned-sandbox.invalid/trpc/health.check") {
					calls.push("health");
					return new Response("ok");
				}
				if (
					url === "https://owned-sandbox.invalid/trpc/sandbox.setEnvironment" &&
					init?.method === "POST"
				) {
					calls.push("environment");
					return new Response("ok");
				}
				throw new Error("Unexpected outbound fetch");
			},
			{ preconnect: () => {} },
		);
	});
	const promote = () =>
		caller().environment.promote({
			cloudWorkspaceId: workspace.id,
			name: "Owned environment",
		});
	test("actual promote policy failure cannot build a golden or persist an environment", async () => {
		await expect(promote()).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toEqual(["claim", "source:policy", "source:stop"]);
		expect(transactions).toBe(0);
		expect(committed).toBe(false);
	});
	test("actual promote failed restart policy deletes golden and never persists or boots", async () => {
		failUpdate = 2;
		await expect(promote()).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toEqual([
			"claim",
			"source:policy",
			"snapshot",
			"golden:create",
			"strip",
			"golden:stop",
			"source:policy",
			"source:stop",
			"golden:delete",
		]);
		expect(transactions).toBe(0);
		expect(committed).toBe(false);
	});
	test("actual promote persists selected checkout only after source policy boot and managed environment", async () => {
		failUpdate = 0;
		const result = await promote();
		expect(goldenOptions.networkPolicy).toBe("deny-all");
		expect(goldenOptions.env).toEqual({});
		expect(calls.indexOf("environment")).toBeLessThan(
			calls.indexOf("transaction"),
		);
		expect(result?.sourceRef).toBe(goldenName);
		expect(saved.hooksRepositoryId).toBeNull();
		expect(committed).toBe(true);
		expect(calls).toContain("bind-environment");
	});
	test("actual promote persistence failure deletes the unused golden after rollback", async () => {
		failUpdate = 0;
		failPersistence = true;
		await expect(promote()).rejects.toThrow("Owned persistence failure");
		expect(calls.at(-1)).toBe("golden:delete");
		expect(committed).toBe(false);
	});
	test("GitHub actual promote retains its default provider order and golden config", async () => {
		gl = false;
		failUpdate = 0;
		await promote();
		expect(goldenOptions).not.toHaveProperty("networkPolicy");
		expect(calls).not.toContain("source:policy");
		expect(calls).not.toContain("environment");
		expect(calls.slice(0, 7)).toEqual([
			"claim",
			"snapshot",
			"golden:create",
			"strip",
			"golden:stop",
			"source:identity",
			"boot",
		]);
		expect(committed).toBe(true);
	});
}
