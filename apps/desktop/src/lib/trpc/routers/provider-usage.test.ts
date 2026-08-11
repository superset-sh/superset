import { describe, expect, test } from "bun:test";
import { createProviderUsageRouter } from "./provider-usage";
import type { ProviderUsageSnapshot } from "./provider-usage.schema";

const snapshot: ProviderUsageSnapshot = {
	providers: [
		{
			providerId: "claude",
			providerName: "Claude",
			status: "ok",
			accountLabel: "Max",
			activeAccountId: "claude:active",
			accounts: [
				{
					id: "claude:active",
					providerId: "claude",
					profileName: "active",
					accountLabel: "Max",
					planLabel: "Max",
					isActive: true,
					status: "ok",
					statusMessage: null,
					windows: [],
				},
			],
			windows: [],
			errorMessage: null,
		},
	],
	collectedAt: 1_000,
};

describe("providerUsage router", () => {
	test("returns a validated snapshot and forwards forced refresh", async () => {
		let force = false;
		const usageRouter = createProviderUsageRouter(async (options) => {
			force = options?.force ?? false;
			return snapshot;
		});
		const caller = usageRouter.createCaller({});

		expect(await caller.getSnapshot({ force: true })).toEqual(snapshot);
		expect(force).toBe(true);
	});

	test("strips fields outside the renderer contract", async () => {
		const usageRouter = createProviderUsageRouter(async () => {
			return {
				...snapshot,
				providers: snapshot.providers.map((provider) => ({
					...provider,
					accessToken: "must-never-reach-renderer",
				})),
			} as unknown as ProviderUsageSnapshot;
		});
		const caller = usageRouter.createCaller({});

		const result = await caller.getSnapshot();
		expect(result.providers[0]).not.toHaveProperty("accessToken");
		expect(result.providers[0]?.accounts[0]).not.toHaveProperty("accessToken");
		expect(JSON.stringify(result)).not.toContain("must-never-reach-renderer");
	});

	test("exposes provider accounts but strips credential material from account rows", async () => {
		const usageRouter = createProviderUsageRouter(async () => {
			return {
				providers: [
					{
						providerId: "codex",
						providerName: "Codex",
						status: "ok",
						accountLabel: "person@example.com",
						activeAccountId: "codex:person",
						windows: [],
						errorMessage: null,
						accounts: [
							{
								id: "codex:person",
								providerId: "codex",
								profileName: "person",
								accountLabel: "person@example.com",
								planLabel: "pro",
								isActive: true,
								status: "cached",
								statusMessage: "cached 4m ago",
								windows: [],
								authJson: "must-never-reach-renderer",
							},
						],
					},
				],
				collectedAt: 1_000,
			} as unknown as ProviderUsageSnapshot;
		});
		const caller = usageRouter.createCaller({});

		const result = await caller.getSnapshot();

		expect(result.providers[0]?.accounts).toEqual([
			{
				id: "codex:person",
				providerId: "codex",
				profileName: "person",
				accountLabel: "person@example.com",
				planLabel: "pro",
				isActive: true,
				status: "cached",
				statusMessage: "cached 4m ago",
				windows: [],
			},
		]);
		expect(JSON.stringify(result)).not.toContain("authJson");
		expect(JSON.stringify(result)).not.toContain("must-never-reach-renderer");
	});

	test("exposes Codex account mutations through the provider usage router", async () => {
		const calls: string[] = [];
		const usageRouter = createProviderUsageRouter({
			collect: async (options) => {
				calls.push(options?.force ? "collect:force" : "collect");
				return snapshot;
			},
			importCurrentCodex: async () => {
				calls.push("import");
				return {
					profileName: "person-example-com",
					authJson: "must-never-reach-renderer",
				} as unknown as { profileName: string };
			},
			addCodexAccount: async () => {
				calls.push("add");
				return {
					profileName: "team-example-com",
					authJson: "must-never-reach-renderer",
				} as unknown as { profileName: string };
			},
			switchCodexProfile: async (profileName) => {
				calls.push(`switch:${profileName}`);
				return {
					profileName,
					authJson: "must-never-reach-renderer",
				} as unknown as { profileName: string };
			},
		});
		const caller = usageRouter.createCaller({});

		await expect(caller.importCurrentCodex()).resolves.toEqual({
			profileName: "person-example-com",
		});
		await expect(caller.addCodexAccount()).resolves.toEqual({
			profileName: "team-example-com",
		});
		await expect(
			caller.switchCodexProfile({ profileName: "team" }),
		).resolves.toEqual({ profileName: "team" });
		expect(calls).toEqual([
			"import",
			"collect:force",
			"add",
			"collect:force",
			"switch:team",
			"collect:force",
		]);
	});

	test("rejects unsafe Codex profile names before switching accounts", async () => {
		const calls: string[] = [];
		const usageRouter = createProviderUsageRouter({
			collect: async () => snapshot,
			switchCodexProfile: async (profileName) => {
				calls.push(profileName);
				return { profileName };
			},
		});
		const caller = usageRouter.createCaller({});

		await expect(
			caller.switchCodexProfile({ profileName: "../active" }),
		).rejects.toThrow();
		await expect(
			caller.switchCodexProfile({ profileName: "/tmp/active" }),
		).rejects.toThrow();
		expect(calls).toEqual([]);
	});
});
