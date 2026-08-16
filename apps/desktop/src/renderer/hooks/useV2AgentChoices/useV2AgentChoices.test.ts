import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	V2_AGENT_CONFIGS_QUERY_KEY,
	V2_AGENT_CONFIGS_SESSION_QUERY_POLICY,
} from "renderer/hooks/useV2AgentConfigs";
import {
	getCapabilityDisplayInventory,
	isAgentChoiceVisible,
} from "./agentChoiceAvailability";
import {
	HOST_AGENT_CAPABILITY_REFRESH_QUERY_KEY,
	HOST_AGENT_CAPABILITY_SNAPSHOT_QUERY_KEY,
	hostAgentCapabilityRefreshQueryKey,
	hostAgentCapabilitySnapshotQueryKey,
} from "./capabilityQueryKeys";
import {
	classifyHostAgentUpdateInvalidation,
	invalidateHostAgentQueries,
	isDiscoveryChangingAgentPatch,
} from "./invalidateHostAgentQueries";
import {
	type AgentChoiceCapability,
	publishCapabilityRefresh,
} from "./useV2AgentChoices";

function capability(
	overrides: Partial<AgentChoiceCapability> &
		Pick<AgentChoiceCapability, "agentId">,
): AgentChoiceCapability {
	const { health: healthOverrides, ...rest } = overrides;
	return {
		presetId: "codex",
		inventory: null,
		inventoryOrigin: "none",
		health: {
			status: "unknown",
			installed: null,
			auth: "unknown",
			checkedAt: "2026-01-01T00:00:00.000Z",
			errorKind: null,
			message: null,
			...healthOverrides,
		},
		healthOrigin: "none",
		...rest,
	};
}

function runtimeInventory(
	agentId: string,
	models: NonNullable<AgentChoiceCapability["inventory"]>["models"],
): NonNullable<AgentChoiceCapability["inventory"]> {
	return {
		schemaVersion: 2,
		agentId,
		presetId: "codex",
		configRevision: 1,
		detectedVersion: "1.0.0",
		modelSource: "runtime",
		models,
		inventoryCheckedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("capability query keys", () => {
	test("export host-scoped snapshot and refresh families", () => {
		expect(HOST_AGENT_CAPABILITY_SNAPSHOT_QUERY_KEY).toEqual([
			"host-agent-capability-snapshots",
		]);
		expect(HOST_AGENT_CAPABILITY_REFRESH_QUERY_KEY).toEqual([
			"host-agent-capability-refresh",
		]);
		expect(hostAgentCapabilitySnapshotQueryKey("http://host-a")).toEqual([
			"host-agent-capability-snapshots",
			"http://host-a",
		]);
		expect(hostAgentCapabilityRefreshQueryKey("http://host-a")).toEqual([
			"host-agent-capability-refresh",
			"http://host-a",
		]);
	});

	test("keeps host URLs isolated", () => {
		expect(hostAgentCapabilitySnapshotQueryKey("http://host-a")).not.toEqual(
			hostAgentCapabilitySnapshotQueryKey("http://host-b"),
		);
		expect(hostAgentCapabilityRefreshQueryKey("http://host-a")).not.toEqual(
			hostAgentCapabilityRefreshQueryKey("http://host-b"),
		);

		const queryClient = new QueryClient();
		const hostA = "http://host-a";
		const hostB = "http://host-b";
		const snapshotA = [capability({ agentId: "a" })];
		const snapshotB = [capability({ agentId: "b" })];
		queryClient.setQueryData(
			hostAgentCapabilitySnapshotQueryKey(hostA),
			snapshotA,
		);
		queryClient.setQueryData(
			hostAgentCapabilitySnapshotQueryKey(hostB),
			snapshotB,
		);
		queryClient.setQueryData(
			hostAgentCapabilityRefreshQueryKey(hostA),
			snapshotA,
		);
		queryClient.setQueryData(
			hostAgentCapabilityRefreshQueryKey(hostB),
			snapshotB,
		);

		invalidateHostAgentQueries(queryClient, hostA, "config-and-capabilities");

		expect(
			queryClient.getQueryState(hostAgentCapabilitySnapshotQueryKey(hostA))
				?.isInvalidated,
		).toBe(true);
		expect(
			queryClient.getQueryState(hostAgentCapabilityRefreshQueryKey(hostA))
				?.isInvalidated,
		).toBe(false);
		expect(
			queryClient.getQueryState(hostAgentCapabilitySnapshotQueryKey(hostB))
				?.isInvalidated,
		).toBe(false);
		expect(
			queryClient.getQueryState(hostAgentCapabilityRefreshQueryKey(hostB))
				?.isInvalidated,
		).toBe(false);
		expect(
			queryClient.getQueryData<AgentChoiceCapability[]>(
				hostAgentCapabilitySnapshotQueryKey(hostB),
			),
		).toEqual(snapshotB);
	});
});

describe("agent config session policy", () => {
	test("keeps external config changes aligned with the next renderer session", () => {
		expect(V2_AGENT_CONFIGS_SESSION_QUERY_POLICY).toEqual({
			staleTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});
	});
});

describe("publishCapabilityRefresh", () => {
	test("prevents an older snapshot response from replacing refreshed data", async () => {
		const queryClient = new QueryClient();
		const hostUrl = "http://host-a";
		const queryKey = hostAgentCapabilitySnapshotQueryKey(hostUrl);
		let releaseSnapshot: (() => void) | undefined;
		const oldRead = queryClient
			.fetchQuery({
				queryKey,
				queryFn: async () => {
					await new Promise<void>((resolve) => {
						releaseSnapshot = resolve;
					});
					return [capability({ agentId: "old" })];
				},
			})
			.catch(() => undefined);

		const refreshed = [capability({ agentId: "new" })];
		await publishCapabilityRefresh(queryClient, hostUrl, refreshed);
		releaseSnapshot?.();
		await oldRead;

		expect(queryClient.getQueryData<AgentChoiceCapability[]>(queryKey)).toEqual(
			refreshed,
		);
	});
});

describe("nested AgentChoiceCapability DTO", () => {
	test("exposes inventory models, modelSource, and health without flattening", () => {
		const view = capability({
			agentId: "codex",
			inventoryOrigin: "persisted",
			healthOrigin: "persisted",
			inventory: runtimeInventory("codex", [
				{
					id: "gpt-5",
					label: "GPT-5",
					reasoning: {
						state: "supported",
						options: [{ id: "high", label: "High" }],
					},
				},
			]),
			health: {
				status: "ready",
				installed: true,
				auth: "authenticated",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: null,
				message: null,
			},
		});

		expect(view.inventory?.models.map((model) => model.id)).toEqual(["gpt-5"]);
		expect(view.inventory?.modelSource).toBe("runtime");
		expect(view.inventory?.inventoryCheckedAt).toBe("2026-01-01T00:00:00.000Z");
		expect(view.health.installed).toBe(true);
		expect(view.health.auth).toBe("authenticated");
		expect(view.health.checkedAt).toBe("2026-01-01T00:00:00.000Z");
		expect(view.health.errorKind).toBeNull();
		expect(view.inventoryOrigin).toBe("persisted");
		expect(view.healthOrigin).toBe("persisted");
	});

	test("preserves installed:null instead of coercing it to false", () => {
		const view = capability({
			agentId: "codex",
			health: {
				status: "unknown",
				installed: null,
				auth: "unknown",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: null,
				message: null,
			},
		});
		expect(view.health.installed).toBeNull();
		expect(isAgentChoiceVisible(view)).toBe(true);
	});
});

describe("agent choice availability", () => {
	test("ready authenticated installed agents are enabled", () => {
		const view = capability({
			agentId: "codex",
			health: {
				status: "ready",
				installed: true,
				auth: "authenticated",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: null,
				message: null,
			},
		});
		expect(isAgentChoiceVisible(view)).toBe(true);
	});

	test("installed:false missing executable is hidden and drops inventory", () => {
		const view = capability({
			agentId: "codex",
			inventory: runtimeInventory("codex", [
				{
					id: "gpt-5",
					label: "GPT-5",
					reasoning: { state: "unknown" },
				},
			]),
			health: {
				status: "unavailable",
				installed: false,
				auth: "unknown",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: "missing_executable",
				message: "Configured executable was not found",
			},
		});
		expect(isAgentChoiceVisible(view)).toBe(false);
		expect(getCapabilityDisplayInventory(view)).toBeNull();
	});

	test("installed:null is unknown but usable", () => {
		const view = capability({
			agentId: "codex",
			inventory: runtimeInventory("codex", [
				{
					id: "gpt-5",
					label: "GPT-5",
					reasoning: { state: "unknown" },
				},
			]),
			health: {
				status: "unknown",
				installed: null,
				auth: "unknown",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: null,
				message: null,
			},
		});
		expect(isAgentChoiceVisible(view)).toBe(true);
		expect(getCapabilityDisplayInventory(view)?.models).toHaveLength(1);
	});

	test("authentication diagnostics do not disable installed agents", () => {
		const view = capability({
			agentId: "codex",
			health: {
				status: "authentication_required",
				installed: true,
				auth: "unauthenticated",
				checkedAt: "2026-01-01T00:00:00.000Z",
				errorKind: null,
				message: "Authentication required",
			},
		});
		expect(isAgentChoiceVisible(view)).toBe(true);
	});
});

describe("mutation invalidation classification", () => {
	const current = { command: "codex", args: ["exec"], env: { FOO: "1" } };

	test("command, args, or env updates invalidate capabilities", () => {
		expect(isDiscoveryChangingAgentPatch(current, { command: "claude" })).toBe(
			true,
		);
		expect(isDiscoveryChangingAgentPatch(current, { env: { FOO: "2" } })).toBe(
			true,
		);
		expect(isDiscoveryChangingAgentPatch(current, { args: ["run"] })).toBe(
			true,
		);
		expect(
			classifyHostAgentUpdateInvalidation(current, { command: "claude" }),
		).toBe("config-and-capabilities");
	});

	test("display and launch-only updates do not invalidate capabilities", () => {
		expect(isDiscoveryChangingAgentPatch(current, { command: "codex" })).toBe(
			false,
		);
		expect(isDiscoveryChangingAgentPatch(current, { env: { FOO: "1" } })).toBe(
			false,
		);
		expect(isDiscoveryChangingAgentPatch(current, { args: ["exec"] })).toBe(
			false,
		);
		expect(classifyHostAgentUpdateInvalidation(current, {})).toBe("config");
	});

	test("config-only invalidation leaves capability families untouched", () => {
		const queryClient = new QueryClient();
		const hostUrl = "http://host-a";
		queryClient.setQueryData([...V2_AGENT_CONFIGS_QUERY_KEY, hostUrl], []);
		queryClient.setQueryData(hostAgentCapabilitySnapshotQueryKey(hostUrl), []);
		queryClient.setQueryData(hostAgentCapabilityRefreshQueryKey(hostUrl), []);

		invalidateHostAgentQueries(queryClient, hostUrl, "config");

		expect(
			queryClient.getQueryState([...V2_AGENT_CONFIGS_QUERY_KEY, hostUrl])
				?.isInvalidated,
		).toBe(true);
		expect(
			queryClient.getQueryState(hostAgentCapabilitySnapshotQueryKey(hostUrl))
				?.isInvalidated,
		).toBe(false);
		expect(
			queryClient.getQueryState(hostAgentCapabilityRefreshQueryKey(hostUrl))
				?.isInvalidated,
		).toBe(false);
	});
});
