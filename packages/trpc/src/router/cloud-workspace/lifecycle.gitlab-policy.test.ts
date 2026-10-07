import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { cloudWorkspaces } from "@superset/db/schema";
import type { SandboxClaim } from "../../lib/sandbox/vercel";

if (process.env.SUPERSET_POLICY_FIXTURE !== "callers") {
	test("actual cloud provision and wake policy callers in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-policy-callers-");
		try {
			execFileSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_POLICY_FIXTURE: "callers",
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
	let calls: string[];
	let required: boolean;
	let policyFails: boolean;
	let deleteFails: boolean;
	let logs: unknown[][];
	const row: typeof cloudWorkspaces.$inferSelect = {
		id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		name: "Owned workspace",
		branch: "work/one",
		baseBranch: "main",
		provider: "vercel",
		providerSandboxId: "owned-source",
		sandboxUrl: null,
		status: "provisioning",
		visibility: "org",
		environmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		hostVersion: null,
		bootAgentCredentialDigest: null,
		agentStatus: null,
		agentStatusAt: null,
		prompt: null,
		description: null,
		projectId: null,
		deletedAt: null,
		createdByUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	mock.module("../../env", () => ({
		env: {
			VERCEL_SANDBOX_TOKEN: "FAKE_PROVIDER_TOKEN",
			VERCEL_SANDBOX_TEAM_ID: "owned-team",
			VERCEL_SANDBOX_PROJECT_ID: "owned-project",
		},
	}));
	mock.module("@superset/db/client", () => ({
		db: {
			query: { cloudWorkspaces: { findFirst: async () => row } },
			update: () => ({
				set: () => ({
					where: async () => {
						calls.push("address-write");
					},
				}),
			}),
		},
	}));
	mock.module("@sentry/core", () => ({
		startSpan: async (_options: unknown, callback: () => unknown) => callback(),
		flush: async () => true,
	}));
	mock.module("../../lib/realtime", () => ({
		nudge: () => calls.push("nudge"),
	}));
	mock.module("./generate-name", () => ({
		generateCloudWorkspaceName: async () => {
			throw new Error("Unexpected naming provider");
		},
	}));
	mock.module("./transition", () => ({
		transitionCloudWorkspace: async ({ to }: { to: typeof row.status }) => {
			calls.push(`status:${to}`);
			row.status = to;
			return true;
		},
	}));
	class FakeAPIError extends Error {
		response = { status: 404 };
	}
	const source = {
		status: "running",
		expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
		update: async () => {
			calls.push("policy");
			if (policyFails)
				throw new Error("FAKE_PROVIDER_TOKEN private policy body");
		},
		stop: async () => {
			calls.push("stop");
			source.status = "stopped";
		},
		delete: async () => {
			calls.push("delete");
			if (deleteFails) throw new Error("Owned delete failure");
		},
		writeFiles: async () => {
			calls.push("identity");
		},
		runCommand: async () => {
			calls.push("boot");
			source.status = "running";
		},
		domain: () => "https://owned-sandbox.invalid",
	};
	const sdk = {
		get: async (options: { resume: boolean }) => {
			expect(options.resume).toBe(false);
			calls.push("get");
			return source;
		},
	};
	mock.module("@vercel/sandbox", () => ({
		APIError: FakeAPIError,
		Sandbox: sdk,
	}));
	expect((await import("@vercel/sandbox")).Sandbox).toBe(sdk);
	const adapter = await import("../../lib/sandbox/vercel");
	const baseClaim: SandboxClaim = {
		identity: {
			SUPERSET_SANDBOX_CONTRACT: "1",
			SUPERSET_API_URL: "https://api.invalid",
			SUPERSET_SANDBOX_WORKSPACE_ID: row.id,
			SUPERSET_SANDBOX_ORGANIZATION_ID: row.organizationId,
			SUPERSET_SANDBOX_REPOSITORIES: "[]",
			SUPERSET_SANDBOX_IMAGE_TAG: "owned-image",
			SUPERSET_SANDBOX_PROVIDER: "vercel",
		},
		hostSecret: "OWNED_HOST_SECRET",
		managedEnv: {},
		networkPolicy: "deny-all",
	};
	mock.module("../../lib/sandbox", () => ({
		...adapter,
		buildSandboxClaim: async () => {
			calls.push("claim");
			return {
				claim: {
					...baseClaim,
					...(required
						? { requireFreshPolicy: true, recheckPolicy: async () => {} }
						: {}),
				},
				environment: {
					sourceKind: "image",
					sourceRef: "owned-image",
					region: "lhr1",
				},
				agentCredentialDigest: "owned-digest",
			};
		},
	}));
	const { provisionCloudWorkspace } = await import("./provision");
	const { wakeCloudWorkspace } = await import("./wake");
	beforeEach(() => {
		calls = [];
		required = true;
		policyFails = true;
		deleteFails = false;
		logs = [];
		row.status = "provisioning";
		row.sandboxUrl = null;
		source.status = "running";
		console.error = (...args) => {
			logs.push(args);
		};
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
	test("actual provisioning records failed after required-policy rejection and cleanup, never ready", async () => {
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: row.id })).toBe(
			"failed",
		);
		expect(calls).toEqual([
			"claim",
			"get",
			"policy",
			"stop",
			"get",
			"delete",
			"status:failed",
			"nudge",
		]);
		expect(row.status).toBe("failed");
		expect(JSON.stringify(logs)).not.toContain("FAKE_PROVIDER_TOKEN");
	});
	test("actual provisioning cleanup failure still records failed and never boot/ready", async () => {
		deleteFails = true;
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: row.id })).toBe(
			"failed",
		);
		expect(calls).not.toContain("boot");
		expect(calls).not.toContain("status:ready");
		expect(row.status).toBe("failed");
	});
	test("actual wake policy rejection cannot record an address or return a usable result", async () => {
		row.status = "ready";
		await expect(wakeCloudWorkspace(row)).rejects.toThrow(
			"Sandbox policy update failed",
		);
		expect(calls).toEqual(["claim", "get", "policy", "stop"]);
	});
	test("successful actual provisioning applies policy before boot, ready and managed environment", async () => {
		policyFails = false;
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: row.id })).toBe(
			"provisioned",
		);
		expect(calls).toEqual([
			"claim",
			"get",
			"policy",
			"identity",
			"boot",
			"status:ready",
			"nudge",
			"health",
			"environment",
		]);
	});
	test("successful actual wake records address only after current policy and environment", async () => {
		row.status = "ready";
		policyFails = false;
		expect((await wakeCloudWorkspace(row)).hostTarget).toBe(
			"https://owned-sandbox.invalid",
		);
		expect(calls).toEqual([
			"claim",
			"get",
			"policy",
			"health",
			"health",
			"environment",
			"address-write",
		]);
	});
	test("GitHub provisioning retains the original no-update reused-create handoff", async () => {
		required = false;
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: row.id })).toBe(
			"provisioned",
		);
		expect(calls).toEqual([
			"claim",
			"get",
			"identity",
			"boot",
			"status:ready",
			"nudge",
			"health",
			"environment",
		]);
	});
}
