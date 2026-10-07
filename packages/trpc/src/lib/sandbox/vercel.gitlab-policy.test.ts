import { beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { SandboxClaim } from "./vercel";

if (process.env.SUPERSET_POLICY_FIXTURE !== "vercel") {
	test("sandbox policy lifecycle in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-vercel-policy-");
		try {
			execFileSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_POLICY_FIXTURE: "vercel",
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
	mock.module("../../env", () => ({
		env: {
			VERCEL_SANDBOX_TOKEN: "FAKE_PROVIDER_TOKEN",
			VERCEL_SANDBOX_TEAM_ID: "owned-team",
			VERCEL_SANDBOX_PROJECT_ID: "owned-project",
		},
	}));
	let calls: string[];
	let updates: number;
	let failUpdate: number;
	let failStop: boolean;
	let failStrip: boolean;
	let exists: boolean;
	let revoked: boolean;
	let revokeDuringUpdate: boolean;
	let revokeDuringIdentity: boolean;
	let revokeDuringHealth: boolean;
	let revokeDuringGolden: boolean;
	let revokeDuringLookup: boolean;
	let createOptions: Record<string, unknown>;
	let forkOptions: Record<string, unknown>;
	class FakeAPIError extends Error {
		response = { status: 404 };
	}
	class OwnedSandbox {
		status = "running";
		expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
		region = "lhr1";
		vcpus = 8;
		currentSnapshotId = "before";
		constructor(readonly name: string) {}
		async update(options: Record<string, unknown>) {
			calls.push(`${this.name}:update`);
			expect(options).toHaveProperty("networkPolicy");
			if (++updates === failUpdate)
				throw new Error("FAKE_PROVIDER_TOKEN private policy body");
			if (revokeDuringUpdate) revoked = true;
		}
		async stop() {
			calls.push(`${this.name}:stop`);
			if (failStop) throw new Error("FAKE_PROVIDER_TOKEN private stop body");
			this.status = "stopped";
			this.currentSnapshotId = "after";
		}
		async snapshot() {
			calls.push(`${this.name}:snapshot`);
			this.status = "stopped";
			return { snapshotId: "owned-snapshot" };
		}
		async writeFiles() {
			calls.push(`${this.name}:identity`);
			this.status = "running";
			if (revokeDuringIdentity) revoked = true;
		}
		async runCommand(options: { cmd: string }) {
			calls.push(`${this.name}:${options.cmd === "rm" ? "strip" : "boot"}`);
			if (options.cmd === "rm" && failStrip)
				throw new Error("Owned strip failed");
			this.status = "running";
		}
		async extendTimeout() {
			calls.push(`${this.name}:extend`);
		}
		async delete() {
			calls.push(`${this.name}:delete`);
		}
		domain() {
			calls.push(`${this.name}:domain`);
			return "https://owned-sandbox.invalid";
		}
	}
	let source: OwnedSandbox;
	let golden: OwnedSandbox;
	const sdk = {
		get: async ({ name, resume }: { name: string; resume: boolean }) => {
			calls.push(`${name}:get`);
			expect(resume).toBe(false);
			if (revokeDuringLookup) revoked = true;
			if (name === "golden") return golden;
			if (!exists) throw new FakeAPIError();
			return source;
		},
		create: async (options: Record<string, unknown>) => {
			createOptions = options;
			calls.push(`${options.name}:create`);
			if (options.name === "golden" && revokeDuringGolden) revoked = true;
			return options.name === "golden" ? golden : source;
		},
		fork: async (options: Record<string, unknown>) => {
			forkOptions = options;
			calls.push(`${options.name}:fork`);
			return source;
		},
	};
	mock.module("@vercel/sandbox", () => ({
		APIError: FakeAPIError,
		Sandbox: sdk,
	}));
	expect((await import("@vercel/sandbox")).Sandbox).toBe(sdk);
	const {
		provisionSandbox,
		wakeSandbox,
		applySandboxPolicy,
		promoteSandboxToEnvironment,
	} = await import("./vercel");
	const gh: SandboxClaim = {
		identity: {
			SUPERSET_SANDBOX_CONTRACT: "1",
			SUPERSET_API_URL: "https://api.invalid",
			SUPERSET_SANDBOX_WORKSPACE_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			SUPERSET_SANDBOX_ORGANIZATION_ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			SUPERSET_SANDBOX_REPOSITORIES: "[]",
			SUPERSET_SANDBOX_IMAGE_TAG: "owned-image",
			SUPERSET_SANDBOX_PROVIDER: "vercel",
		},
		hostSecret: "OWNED_HOST_SECRET",
		managedEnv: { PUBLIC_INPUT: "owned" },
		networkPolicy: {
			allow: {
				"gitlab.invalid": [
					{ forwardURL: "https://api.invalid/api/gitlab/proxy" },
				],
				"*": [],
			},
		},
	};
	const gl = {
		...gh,
		requireFreshPolicy: true as const,
		recheckPolicy: async () => {
			calls.push("grant");
			if (revoked) throw new Error("Owned grant revoked");
		},
	};
	const environment = {
		sourceKind: "image" as const,
		sourceRef: "owned-image",
		region: "lhr1",
	};
	beforeEach(() => {
		calls = [];
		updates = 0;
		failUpdate = 0;
		failStop = false;
		failStrip = false;
		exists = true;
		revoked = false;
		revokeDuringUpdate = false;
		revokeDuringIdentity = false;
		revokeDuringHealth = false;
		revokeDuringGolden = false;
		revokeDuringLookup = false;
		createOptions = {};
		forkOptions = {};
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
					if (revokeDuringHealth) revoked = true;
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
	test("reused GitLab create updates policy before identity and boot", async () => {
		await provisionSandbox({ name: "source", environment, claim: gl });
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:identity",
			"source:boot",
			"source:domain",
			"source:domain",
		]);
	});
	test("reused GitLab create policy failure stops without boot or result", async () => {
		failUpdate = 1;
		await expect(
			provisionSandbox({ name: "source", environment, claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:stop",
		]);
	});
	test("new GitLab image and fork explicitly pass the current claim policy", async () => {
		exists = false;
		await provisionSandbox({ name: "source", environment, claim: gl });
		expect(createOptions.networkPolicy).toEqual(gl.networkPolicy);
		expect(createOptions).not.toHaveProperty("recheckPolicy");
		expect(createOptions).not.toHaveProperty("requireFreshPolicy");
		await provisionSandbox({
			name: "source",
			environment: {
				...environment,
				sourceKind: "fork",
				sourceRef: "owned-golden",
			},
			claim: gl,
		});
		expect(forkOptions.networkPolicy).toEqual(gl.networkPolicy);
		expect(forkOptions).not.toHaveProperty("recheckPolicy");
	});
	for (const state of ["running", "stopped"])
		test(`GitLab ${state} wake policy failure cannot resume or expose the source`, async () => {
			source.status = state;
			failUpdate = 1;
			await expect(
				wakeSandbox({ providerSandboxId: "source", claim: gl }),
			).rejects.toThrow("Sandbox policy update failed");
			expect(calls.filter((value) => value !== "grant")).toEqual([
				"source:get",
				"source:update",
				"source:stop",
			]);
		});
	test("serving GitLab wake updates before host probes and managed environment", async () => {
		expect(
			await wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).toEqual({ hostTarget: "https://owned-sandbox.invalid", booted: false });
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:domain",
			"health",
			"health",
			"environment",
		]);
	});
	test("stopped GitLab wake applies policy before any operation that can resume", async () => {
		source.status = "stopped";
		expect(
			(await wakeSandbox({ providerSandboxId: "source", claim: gl })).booted,
		).toBe(true);
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:domain",
			"source:identity",
			"source:boot",
			"health",
			"environment",
		]);
	});
	test("failed required policy preserves rejection when stop also fails without private provider details", async () => {
		failUpdate = 1;
		failStop = true;
		try {
			await wakeSandbox({ providerSandboxId: "source", claim: gl });
			throw new Error("Expected rejection");
		} catch (error) {
			expect(String(error)).toBe("Error: Sandbox policy update failed");
			expect(JSON.stringify(error)).not.toContain("FAKE_PROVIDER_TOKEN");
			expect(error).toHaveProperty("stopFailed", true);
		}
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:stop",
		]);
	});
	test("required running credential refresh stops on update failure", async () => {
		failUpdate = 1;
		await expect(
			applySandboxPolicy({
				providerSandboxId: "source",
				networkPolicy: gl.networkPolicy,
				requireFreshPolicy: true,
				recheckPolicy: gl.recheckPolicy,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:stop",
		]);
	});
	test("stopped refresh remains not-running and never resumes", async () => {
		source.status = "stopped";
		expect(
			await applySandboxPolicy({
				providerSandboxId: "source",
				networkPolicy: gl.networkPolicy,
				requireFreshPolicy: true,
				recheckPolicy: gl.recheckPolicy,
			}),
		).toBe("not-running");
		expect(calls.filter((value) => value !== "grant")).toEqual(["source:get"]);
	});
	test("GitLab golden is explicitly unbound and source restarts only after fresh policy", async () => {
		await promoteSandboxToEnvironment({
			sourceSandbox: "source",
			goldenName: "golden",
			claim: gl,
		});
		expect(createOptions.env).toEqual({});
		expect(createOptions.networkPolicy).toBe("deny-all");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:snapshot",
			"golden:create",
			"golden:strip",
			"golden:stop",
			"golden:get",
			"source:update",
			"source:identity",
			"source:boot",
			"source:domain",
			"health",
			"environment",
		]);
	});
	test("GitLab promotion rejects failed policy before taking a snapshot", async () => {
		failUpdate = 1;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:stop",
		]);
	});
	test("failed source restart policy deletes the unused golden and never boots", async () => {
		failUpdate = 2;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:snapshot",
			"golden:create",
			"golden:strip",
			"golden:stop",
			"golden:get",
			"source:update",
			"source:stop",
			"golden:delete",
		]);
	});
	test("failed golden stripping cleans the golden and keeps the source stopped", async () => {
		failStrip = true;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Owned strip failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:snapshot",
			"golden:create",
			"golden:strip",
			"golden:delete",
			"source:stop",
		]);
	});
	test("GitHub reused creation retains its original operations", async () => {
		await provisionSandbox({ name: "source", environment, claim: gh });
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:identity",
			"source:boot",
			"source:domain",
			"source:domain",
		]);
	});
	test("GitHub promotion retains its original golden and source restart operations", async () => {
		await promoteSandboxToEnvironment({
			sourceSandbox: "source",
			goldenName: "golden",
			claim: gh,
		});
		expect(createOptions).not.toHaveProperty("networkPolicy");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:snapshot",
			"golden:create",
			"golden:strip",
			"golden:stop",
			"golden:get",
			"source:identity",
			"source:boot",
		]);
	});
	test("GitHub wake retains best-effort policy updates and serving call order", async () => {
		failUpdate = 1;
		expect(
			(await wakeSandbox({ providerSandboxId: "source", claim: gh })).booted,
		).toBe(false);
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:domain",
			"health",
			"source:update",
			"health",
			"environment",
		]);
	});
	test("required grant revocation during policy await prevents boot and serving", async () => {
		revokeDuringUpdate = true;
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toEqual([
			"source:get",
			"grant",
			"source:update",
			"grant",
			"source:stop",
		]);
	});
	test("required grant revocation during identity write prevents source boot", async () => {
		source.status = "stopped";
		revokeDuringIdentity = true;
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).not.toContain("source:boot");
		expect(calls).not.toContain("environment");
		expect(calls.at(-1)).toBe("source:stop");
	});
	test("required grant revocation during settle health wait prevents environment push and result", async () => {
		source.status = "stopped";
		revokeDuringHealth = true;
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toContain("health");
		expect(calls).not.toContain("environment");
		expect(calls.at(-1)).toBe("source:stop");
	});
	test("settle revocation still rejects and reports failed stop without provider body", async () => {
		source.status = "stopped";
		revokeDuringHealth = true;
		failStop = true;
		try {
			await wakeSandbox({ providerSandboxId: "source", claim: gl });
			throw new Error("Expected rejection");
		} catch (error) {
			expect(error).toHaveProperty("stopFailed", true);
			expect(JSON.stringify(error)).not.toContain("FAKE_PROVIDER_TOKEN");
		}
		expect(calls).not.toContain("environment");
	});
	test("grant revocation during golden creation prevents source policy restart and cleans the unbound golden", async () => {
		revokeDuringGolden = true;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.filter((value) => value !== "grant")).toEqual([
			"source:get",
			"source:update",
			"source:snapshot",
			"golden:create",
			"golden:strip",
			"golden:stop",
			"golden:get",
			"source:stop",
			"golden:delete",
		]);
		expect(createOptions.networkPolicy).toBe("deny-all");
		expect(calls).not.toContain("source:boot");
	});
	test("new create grant revoked during provider lookup cannot create or boot a sandbox", async () => {
		exists = false;
		revokeDuringLookup = true;
		await expect(
			provisionSandbox({ name: "source", environment, claim: gl }),
		).rejects.toThrow("Owned grant revoked");
		expect(calls).toEqual(["source:get", "grant"]);
	});
	test("required policy without a current-grant callback fails closed", async () => {
		await expect(
			wakeSandbox({
				providerSandboxId: "source",
				claim: { ...gh, requireFreshPolicy: true },
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toEqual(["source:get", "source:stop"]);
	});
	test("grant revocation during initial unhealthy probe prevents identity-write resume", async () => {
		globalThis.fetch = Object.assign(
			async (input: Parameters<typeof fetch>[0]) => {
				if (String(input) !== "https://owned-sandbox.invalid/trpc/health.check")
					throw new Error("Unexpected outbound fetch");
				calls.push("health");
				revoked = true;
				return new Response("not ready", { status: 503 });
			},
			{ preconnect: () => {} },
		);
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).not.toContain("source:identity");
		expect(calls).not.toContain("source:boot");
		expect(calls.at(-1)).toBe("source:stop");
	});
	test("grant revocation during timeout extension prevents identity-write resume", async () => {
		source.expiresAt = new Date(0);
		source.extendTimeout = async () => {
			calls.push("source:extend");
			revoked = true;
		};
		globalThis.fetch = Object.assign(
			async (input: Parameters<typeof fetch>[0]) => {
				if (String(input) !== "https://owned-sandbox.invalid/trpc/health.check")
					throw new Error("Unexpected outbound fetch");
				calls.push("health");
				return new Response("not ready", { status: 503 });
			},
			{ preconnect: () => {} },
		);
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).not.toContain("source:identity");
		expect(calls).not.toContain("source:boot");
		expect(calls.at(-1)).toBe("source:stop");
	});
	test("grant revocation during managed environment await prevents wake success", async () => {
		globalThis.fetch = Object.assign(
			async (input: Parameters<typeof fetch>[0]) => {
				const url = String(input);
				if (url === "https://owned-sandbox.invalid/trpc/health.check") {
					calls.push("health");
					return new Response("ok");
				}
				if (
					url === "https://owned-sandbox.invalid/trpc/sandbox.setEnvironment"
				) {
					calls.push("environment");
					revoked = true;
					return new Response("ok");
				}
				throw new Error("Unexpected outbound fetch");
			},
			{ preconnect: () => {} },
		);
		await expect(
			wakeSandbox({ providerSandboxId: "source", claim: gl }),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls.at(-1)).toBe("source:stop");
	});
	test("marked readiness failure retains classification and exposes failed stop cleanup", async () => {
		failStop = true;
		const now = Date.now;
		let reads = 0;
		Date.now = () => now() + (++reads > 1 ? 120000 : 0);
		try {
			const { settleSandbox, SandboxNotReadyError } = await import("./vercel");
			let failure: unknown;
			try {
				await settleSandbox({
					providerSandboxId: "source",
					hostTarget: "https://owned-sandbox.invalid",
					claim: gl,
				});
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(SandboxNotReadyError);
			expect(failure).toHaveProperty("name", "SandboxNotReadyError");
			expect(failure).toHaveProperty("stopFailed", true);
			expect(calls.at(-1)).toBe("source:stop");
		} finally {
			Date.now = now;
		}
	});
	test("default readiness error does not emit an optional cleanup field", async () => {
		const { SandboxNotReadyError } = await import("./vercel");
		expect(
			Object.hasOwn(new SandboxNotReadyError("source"), "stopFailed"),
		).toBe(false);
	});
	for (const existing of [false, true]) {
		test(`grant revocation during ${existing ? "reused" : "new"} boot prevents address handoff`, async () => {
			exists = existing;
			source.runCommand = async () => {
				calls.push("source:boot");
				source.status = "running";
				revoked = true;
			};
			await expect(
				provisionSandbox({ name: "source", environment, claim: gl }),
			).rejects.toThrow("Sandbox policy update failed");
			expect(calls).not.toContain("source:domain");
			expect(calls.at(-1)).toBe("source:stop");
		});
	}
	test("stopped promotion revoked during golden creation cannot return reusable snapshot", async () => {
		source.status = "stopped";
		revokeDuringGolden = true;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).toContain("golden:delete");
		expect(calls).not.toContain("source:boot");
	});
	test("stopped promotion revoked during source snapshot cannot return reusable snapshot", async () => {
		source.status = "stopped";
		source.snapshot = async () => {
			calls.push("source:snapshot");
			revoked = true;
			return { snapshotId: "owned-snapshot" };
		};
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "source",
				goldenName: "golden",
				claim: gl,
			}),
		).rejects.toThrow("Sandbox policy update failed");
		expect(calls).not.toContain("golden:create");
		expect(calls).not.toContain("source:boot");
	});
}
