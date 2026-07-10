import { afterEach, describe, expect, mock, test } from "bun:test";

// Control what `findHostWorkspace` resolves per test. The command imports it
// from the lib barrel, so mock that module before importing the SUT.
type FindResult = {
	workspace: Record<string, unknown> | undefined;
	warnings: string[];
};
let findResult: FindResult = { workspace: undefined, warnings: [] };
mock.module("../../../lib/host-workspaces", () => ({
	findHostWorkspace: async () => findResult,
}));

const { default: getCommand } = await import("./command");

const WORKSPACE = {
	id: "b502bf30-8693-4815-be65-795035e0ce5f",
	organizationId: "org-1",
	projectId: "proj-1",
	hostId: "host-1",
	name: "ludicrous-candytuft",
	branch: "setup",
	type: "worktree" as const,
	createdByUserId: "user-1",
	taskId: null,
	createdAt: new Date("2026-04-24T22:00:41.950Z"),
	updatedAt: new Date("2026-04-24T22:00:41.950Z"),
	worktreePath: "/home/me/.superset/worktrees/proj-1/setup",
	worktreeExists: true,
};

function makeCtx(
	overrides: {
		organizationId?: string | undefined;
		projects?: Array<{ id: string; name: string }>;
		hosts?: Array<{ id: string; name: string }>;
	} = {},
) {
	const {
		organizationId = "org-1",
		projects = [{ id: "proj-1", name: "Superset" }],
		hosts = [{ id: "host-1", name: "Town-Hall" }],
	} = overrides;
	return {
		api: {
			v2Project: { list: { query: async () => projects } },
			host: { list: { query: async () => hosts } },
		},
		config: { organizationId },
		bearer: "bearer",
		authSource: "oauth",
	} as never;
}

function invoke(args: { id?: string }, options: { field?: string } = {}) {
	return getCommand.run({
		ctx: makeCtx(),
		args: args as never,
		options: options as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	findResult = { workspace: undefined, warnings: [] };
	delete process.env.SUPERSET_WORKSPACE_ID;
});

describe("workspaces get", () => {
	test("resolves by explicit id and enriches project/host names", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		const result = (await invoke({ id: WORKSPACE.id })) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(result.data.name).toBe("ludicrous-candytuft");
		expect(result.data.projectName).toBe("Superset");
		expect(result.data.hostName).toBe("Town-Hall");
		expect(result.data.worktreePath).toBe(WORKSPACE.worktreePath);
		expect(result.message).toContain("name");
		expect(result.message).toContain("ludicrous-candytuft");
	});

	test("defaults the id to $SUPERSET_WORKSPACE_ID when no arg is given", async () => {
		process.env.SUPERSET_WORKSPACE_ID = WORKSPACE.id;
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		const result = (await invoke({})) as { data: Record<string, unknown> };
		expect(result.data.id).toBe(WORKSPACE.id);
	});

	test("errors when no id is passed and the env var is unset", async () => {
		await expect(invoke({})).rejects.toThrow(/No workspace id/);
	});

	test("--field prints the raw value as the message, data stays full", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		const result = (await invoke({ id: WORKSPACE.id }, { field: "name" })) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(result.message).toBe("ludicrous-candytuft");
		expect(result.data.branch).toBe("setup");
	});

	test("--field with a null value yields an empty message", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		const result = (await invoke(
			{ id: WORKSPACE.id },
			{ field: "taskId" },
		)) as {
			message: string;
		};
		expect(result.message).toBe("");
	});

	test("--field rejects an unknown field name", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		await expect(
			invoke({ id: WORKSPACE.id }, { field: "bogus" }),
		).rejects.toThrow(/Unknown field: bogus/);
	});

	test("--field rejects inherited Object.prototype keys", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		await expect(
			invoke({ id: WORKSPACE.id }, { field: "toString" }),
		).rejects.toThrow(/Unknown field: toString/);
	});

	test("errors when no reachable host knows the id", async () => {
		findResult = { workspace: undefined, warnings: [] };
		await expect(invoke({ id: WORKSPACE.id })).rejects.toThrow(/not found/);
	});

	test("falls back to ids when cloud project/host lookups fail", async () => {
		findResult = { workspace: { ...WORKSPACE }, warnings: [] };
		const result = (await getCommand.run({
			ctx: {
				api: {
					v2Project: {
						list: {
							query: async () => {
								throw new Error("cloud down");
							},
						},
					},
					host: {
						list: {
							query: async () => {
								throw new Error("cloud down");
							},
						},
					},
				},
				config: { organizationId: "org-1" },
				bearer: "bearer",
				authSource: "oauth",
			} as never,
			args: { id: WORKSPACE.id } as never,
			options: {} as never,
			signal: new AbortController().signal,
		})) as { data: Record<string, unknown> };
		expect(result.data.projectName).toBe("proj-1");
		expect(result.data.hostName).toBe("host-1");
	});
});
