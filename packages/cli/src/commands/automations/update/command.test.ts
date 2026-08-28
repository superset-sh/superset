import { beforeEach, describe, expect, mock, test } from "bun:test";

// Capture what the command hands to the target resolver and to the update
// mutation. The command imports the resolver from the parent directory, so
// mock that module before importing the SUT.
type ResolverArgs = Record<string, unknown>;
let resolverCalls: ResolverArgs[] = [];
let resolverResult: { targetHostId: string; v2ProjectId: string | null } = {
	targetHostId: "host-current",
	v2ProjectId: "project-1",
};
mock.module("../resolveAutomationTarget", () => ({
	resolveAutomationTarget: async (args: ResolverArgs) => {
		resolverCalls.push(args);
		return resolverResult;
	},
}));

const { default: updateCommand } = await import("./command");

const AUTOMATION_ID = "0b8f4a92-01c4-4c8e-9f31-b1a5b2f9d001";
const WORKSPACE_ID = "b502bf30-8693-4815-be65-795035e0ce5f";

let updateCalls: Record<string, unknown>[] = [];
let getCalls: Record<string, unknown>[] = [];
let existingAutomation: Record<string, unknown>;

function makeCtx() {
	return {
		api: {
			automation: {
				get: {
					query: async (input: Record<string, unknown>) => {
						getCalls.push(input);
						return existingAutomation;
					},
				},
				update: {
					mutate: async (input: Record<string, unknown>) => {
						updateCalls.push(input);
						return { ...existingAutomation, ...input };
					},
				},
				setEnabled: { mutate: async () => ({}) },
			},
		},
		config: { organizationId: "org-1" },
		bearer: "jwt",
		authSource: "oauth",
	} as never;
}

function invoke(options: Record<string, unknown>) {
	return updateCommand.run({
		ctx: makeCtx(),
		args: { id: AUTOMATION_ID } as never,
		options: options as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	resolverCalls = [];
	updateCalls = [];
	getCalls = [];
	resolverResult = { targetHostId: "host-current", v2ProjectId: "project-1" };
	existingAutomation = {
		id: AUTOMATION_ID,
		name: "nightly",
		targetHostId: "host-current",
		v2ProjectId: "project-1",
		v2WorkspaceId: null,
	};
});

describe("automations update host targeting (#6522)", () => {
	test("a metadata-only update never resolves a target or sends a host", async () => {
		await invoke({ name: "renamed" });
		expect(resolverCalls).toHaveLength(0);
		expect(getCalls).toHaveLength(0);
		expect(updateCalls).toHaveLength(1);
		expect("targetHostId" in (updateCalls[0] ?? {})).toBe(false);
	});

	test("--project without --host validates against the automation's current host and does not move it", async () => {
		resolverResult = { targetHostId: "host-current", v2ProjectId: "project-2" };
		await invoke({ project: "project-2" });
		expect(resolverCalls).toHaveLength(1);
		expect(resolverCalls[0]?.hostId).toBeUndefined();
		expect(resolverCalls[0]?.defaultHostId).toBe("host-current");
		expect("targetHostId" in (updateCalls[0] ?? {})).toBe(false);
		expect(updateCalls[0]?.v2ProjectId).toBe("project-2");
	});

	test("--host moves the automation explicitly", async () => {
		resolverResult = { targetHostId: "host-b", v2ProjectId: "project-2" };
		await invoke({ project: "project-2", host: "host-b" });
		expect(resolverCalls[0]?.hostId).toBe("host-b");
		expect(updateCalls[0]?.targetHostId).toBe("host-b");
	});

	test("--workspace pins with the automation's current host when --host is omitted", async () => {
		await invoke({ workspace: WORKSPACE_ID });
		expect(resolverCalls[0]?.defaultHostId).toBe("host-current");
		// The pin is stored denormalized, so its host must ride along even
		// though --host was omitted; it is the current host, not this machine.
		expect(updateCalls[0]?.targetHostId).toBe("host-current");
		expect(updateCalls[0]?.v2WorkspaceId).toBe(WORKSPACE_ID);
		expect(updateCalls[0]?.v2ProjectId).toBe("project-1");
	});
});

describe("automations update pin clearing (#6523)", () => {
	test('--workspace "" clears the pin without resolving or moving anything', async () => {
		await invoke({ workspace: "" });
		expect(resolverCalls).toHaveLength(0);
		expect(updateCalls[0]?.v2WorkspaceId).toBeNull();
		expect("targetHostId" in (updateCalls[0] ?? {})).toBe(false);
	});

	test('--workspace "" combined with --project keeps the project and clears the pin', async () => {
		resolverResult = { targetHostId: "host-current", v2ProjectId: "project-2" };
		await invoke({ workspace: "", project: "project-2" });
		expect(resolverCalls).toHaveLength(1);
		expect(resolverCalls[0]?.workspaceId).toBeUndefined();
		expect(updateCalls[0]?.v2WorkspaceId).toBeNull();
		expect(updateCalls[0]?.v2ProjectId).toBe("project-2");
		expect("targetHostId" in (updateCalls[0] ?? {})).toBe(false);
	});
});
