import { beforeEach, expect, mock, test } from "bun:test";
import type { CliContext } from "../../../lib/command";

const killSession = mock(
	async (_input: { terminalId: string; workspaceId: string }) => ({
		terminalId: _input.terminalId,
		status: "disposed" as const,
	}),
);

const resolveHostTarget = mock(() => ({
	kind: "local" as const,
	hostId: "host-1",
	client: { terminal: { killSession: { mutate: killSession } } },
}));

mock.module("../../../lib/host-target", () => ({
	resolveHostTarget,
	resolveHostFilter: () => undefined,
}));

const getFromHost = mock(async () => ({ hostId: "host-1" }));

const { default: closeCommand } = await import("./command");

function createCtx(): CliContext {
	return {
		api: { v2Workspace: { getFromHost: { query: getFromHost } } },
		config: { organizationId: "org-1" },
		bearer: "jwt",
		authSource: "config",
	} as unknown as CliContext;
}

beforeEach(() => {
	killSession.mockClear();
	resolveHostTarget.mockClear();
	getFromHost.mockClear();
});

const signal = new AbortController().signal;

test("kills each terminal id against the owning workspace", async () => {
	const result = (await closeCommand.run({
		ctx: createCtx(),
		options: { workspace: "ws-1", host: undefined, local: undefined },
		args: { ids: ["t-1", "t-2"] },
		signal,
	})) as { data: { closed: string[] }; message: string };

	expect(killSession).toHaveBeenCalledTimes(2);
	expect(killSession).toHaveBeenNthCalledWith(1, {
		terminalId: "t-1",
		workspaceId: "ws-1",
	});
	expect(killSession).toHaveBeenNthCalledWith(2, {
		terminalId: "t-2",
		workspaceId: "ws-1",
	});
	expect(result.data.closed).toEqual(["t-1", "t-2"]);
	expect(result.message).toBe("Closed 2 terminals");
});

test("singular message for a single terminal", async () => {
	const result = (await closeCommand.run({
		ctx: createCtx(),
		options: { workspace: "ws-1", host: undefined, local: undefined },
		args: { ids: ["t-1"] },
		signal,
	})) as { message: string };

	expect(result.message).toBe("Closed terminal t-1");
});
