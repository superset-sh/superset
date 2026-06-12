import { beforeEach, expect, mock, test } from "bun:test";
import type { CliContext } from "../../../lib/command";

const listSessions = mock(async (_input: { workspaceId: string }) => ({
	sessions: [
		{
			terminalId: "11111111-1111-1111-1111-111111111111",
			workspaceId: "ws-1",
			createdAt: 0,
			exited: false,
			exitCode: 0,
			attached: true,
			title: "bash",
		},
		{
			terminalId: "22222222-2222-2222-2222-222222222222",
			workspaceId: "ws-1",
			createdAt: 0,
			exited: true,
			exitCode: 137,
			attached: false,
			title: null,
		},
	],
}));

const resolveHostTarget = mock(() => ({
	kind: "local" as const,
	hostId: "host-1",
	client: { terminal: { listSessions: { query: listSessions } } },
}));

mock.module("../../../lib/host-target", () => ({
	resolveHostTarget,
	resolveHostFilter: () => undefined,
}));

const getFromHost = mock(
	async (_input: { organizationId: string; id: string }) => ({
		hostId: "host-1",
	}),
);

const { default: listCommand } = await import("./command");

function createCtx(): CliContext {
	return {
		api: { v2Workspace: { getFromHost: { query: getFromHost } } },
		config: { organizationId: "org-1" },
		bearer: "jwt",
		authSource: "config",
	} as unknown as CliContext;
}

beforeEach(() => {
	listSessions.mockClear();
	resolveHostTarget.mockClear();
	getFromHost.mockClear();
});

const signal = new AbortController().signal;

test("resolves the workspace host and lists its terminal sessions", async () => {
	const result = (await listCommand.run({
		ctx: createCtx(),
		options: { workspace: "ws-1", host: undefined, local: undefined },
		args: {},
		signal,
	})) as Array<Record<string, unknown>>;

	expect(getFromHost).toHaveBeenCalledWith({
		organizationId: "org-1",
		id: "ws-1",
	});
	expect(listSessions).toHaveBeenCalledWith({ workspaceId: "ws-1" });
	expect(result).toHaveLength(2);
});

test("derives a human-readable status and full (untruncated) terminal IDs", async () => {
	const result = (await listCommand.run({
		ctx: createCtx(),
		options: { workspace: "ws-1", host: undefined, local: undefined },
		args: {},
		signal,
	})) as Array<Record<string, unknown>>;

	expect(result[0]?.status).toBe("active");
	expect(result[1]?.status).toBe("exited (137)");
	// Full UUID preserved (regression guard against the #5245 truncation bug).
	expect(result[0]?.terminalId).toBe("11111111-1111-1111-1111-111111111111");
	expect(result[0]?.id).toBe("11111111-1111-1111-1111-111111111111");
});
