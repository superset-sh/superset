import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import getCommand from "./command";

let workspaces: Array<Record<string, unknown>> = [];
let previousWorkspaceId: string | undefined;

withLocalHostService("org-1", { "workspace.list": () => workspaces });

const WORKSPACE = {
	id: "b502bf30-8693-4815-be65-795035e0ce5f",
	organizationId: "org-1",
	projectId: "proj-1",
	projectName: "Superset",
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
		hosts?: Array<{ id: string; name: string }>;
	} = {},
) {
	const {
		organizationId = "org-1",
		hosts = [{ id: "host-1", name: "Town-Hall" }],
	} = overrides;
	return {
		api: {
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
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	previousWorkspaceId = process.env.SUPERSET_WORKSPACE_ID;
	delete process.env.SUPERSET_WORKSPACE_ID;
});

afterEach(() => {
	workspaces = [];
	if (previousWorkspaceId === undefined) {
		delete process.env.SUPERSET_WORKSPACE_ID;
	} else {
		process.env.SUPERSET_WORKSPACE_ID = previousWorkspaceId;
	}
});

describe("workspaces get", () => {
	test("resolves by explicit id and enriches project/host names", async () => {
		workspaces = [WORKSPACE];
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
		workspaces = [WORKSPACE];
		const result = (await invoke({})) as { data: Record<string, unknown> };
		expect(result.data.id).toBe(WORKSPACE.id);
	});

	test("errors when no id is passed and the env var is unset", async () => {
		await expect(invoke({})).rejects.toThrow(/No workspace id/);
	});

	test("--field prints the raw value as the message, data stays full", async () => {
		workspaces = [WORKSPACE];
		const result = (await invoke({ id: WORKSPACE.id }, { field: "name" })) as {
			data: Record<string, unknown>;
			message: string;
		};
		expect(result.message).toBe("ludicrous-candytuft");
		expect(result.data.branch).toBe("setup");
	});

	test("--field with a null value yields an empty message", async () => {
		workspaces = [WORKSPACE];
		const result = (await invoke(
			{ id: WORKSPACE.id },
			{ field: "taskId" },
		)) as {
			message: string;
		};
		expect(result.message).toBe("");
	});

	test("--field rejects an unknown field name", async () => {
		workspaces = [WORKSPACE];
		await expect(
			invoke({ id: WORKSPACE.id }, { field: "bogus" }),
		).rejects.toThrow(/Unknown field: bogus/);
	});

	test("--field rejects inherited Object.prototype keys", async () => {
		workspaces = [WORKSPACE];
		await expect(
			invoke({ id: WORKSPACE.id }, { field: "toString" }),
		).rejects.toThrow(/Unknown field: toString/);
	});

	test("errors when the workspace is not on the target host", async () => {
		await expect(invoke({ id: WORKSPACE.id })).rejects.toThrow(/not found/);
	});

	test("falls back to ids when the row has no project name and host lookup fails", async () => {
		workspaces = [{ ...WORKSPACE, projectName: null }];
		const result = (await getCommand.run({
			ctx: {
				api: {
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
			options: { local: true } as never,
			signal: new AbortController().signal,
		})) as { data: Record<string, unknown> };
		expect(result.data.projectName).toBe("proj-1");
		expect(result.data.hostName).toBe("host-1");
	});
});
