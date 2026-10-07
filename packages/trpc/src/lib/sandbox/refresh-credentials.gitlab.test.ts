import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_POLICY_FIXTURE !== "refresh") {
	test("credential refresh policy handoff in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-refresh-policy-");
		try {
			execFileSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_POLICY_FIXTURE: "refresh",
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
	let status: string;
	let outcome: "applied" | "not-running";
	let fail: boolean;
	let options: unknown;
	const recheckPolicy = async () => {};
	mock.module("../../env", () => ({ env: {} }));
	mock.module("@superset/db/client", () => ({
		db: {
			query: {
				cloudWorkspaces: {
					findFirst: async () => {
						calls.push("row");
						return {
							id: "owned-ws",
							status,
							providerSandboxId: "owned-source",
						};
					},
				},
			},
		},
	}));
	mock.module("./access", () => ({
		sandboxHostSecretFor: async () => {
			calls.push("secret");
			return "OWNED_SECRET";
		},
	}));
	mock.module("./claim", () => ({
		buildSandboxClaim: async () => {
			calls.push("claim");
			return {
				claim: {
					networkPolicy: "deny-all",
					...(required ? { requireFreshPolicy: true, recheckPolicy } : {}),
				},
			};
		},
	}));
	const apply = async (input: unknown) => {
		calls.push("policy");
		options = input;
		if (fail) throw new Error("Owned policy failure");
		return outcome;
	};
	mock.module("./vercel", () => ({ applySandboxPolicy: apply }));
	expect((await import("./vercel")).applySandboxPolicy).toBe(apply);
	const { refreshSandboxCredentials } = await import("./refresh-credentials");
	const refresh = (presentedSecret = "OWNED_SECRET") =>
		refreshSandboxCredentials({ workspaceId: "owned-ws", presentedSecret });
	beforeEach(() => {
		calls = [];
		required = true;
		status = "ready";
		outcome = "applied";
		fail = false;
		options = undefined;
	});
	test("GitLab refresh passes required fresh policy to the actual adapter seam", async () => {
		expect(await refresh()).toBe("applied");
		expect(options).toEqual({
			providerSandboxId: "owned-source",
			networkPolicy: "deny-all",
			requireFreshPolicy: true,
			recheckPolicy,
		});
		expect(calls).toEqual(["secret", "row", "claim", "policy"]);
	});
	test("GitHub refresh preserves the exact default policy arguments and operation order", async () => {
		required = false;
		expect(await refresh()).toBe("applied");
		expect(options).toEqual({
			providerSandboxId: "owned-source",
			networkPolicy: "deny-all",
		});
		expect(calls).toEqual(["secret", "row", "claim", "policy"]);
	});
	test("invalid secret rejects before row or policy work", async () => {
		expect(await refresh("foreign-secret")).toBe("unauthorized");
		expect(calls).toEqual(["secret"]);
	});
	test("nonready workspace and stopped provider preserve their distinct outcomes", async () => {
		status = "failed";
		expect(await refresh()).toBe("not-ready");
		expect(calls).toEqual(["secret", "row"]);
		status = "ready";
		outcome = "not-running";
		expect(await refresh()).toBe("not-running");
	});
	test("required policy failure cannot report applied", async () => {
		fail = true;
		await expect(refresh()).rejects.toThrow("Owned policy failure");
		expect(calls).toEqual(["secret", "row", "claim", "policy"]);
	});
}
