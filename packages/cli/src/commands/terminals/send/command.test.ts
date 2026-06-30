import { beforeEach, expect, mock, test } from "bun:test";
import type { CliContext } from "../../../lib/command";

const writeInput = mock(
	async (_input: {
		terminalId: string;
		workspaceId: string;
		data: string;
	}) => ({
		success: true as const,
	}),
);

const resolveHostTarget = mock(() => ({
	kind: "local" as const,
	hostId: "host-1",
	client: { terminal: { writeInput: { mutate: writeInput } } },
}));

mock.module("../../../lib/host-target", () => ({
	resolveHostTarget,
	resolveHostFilter: () => undefined,
}));

const getFromHost = mock(async () => ({ hostId: "host-1" }));

const { default: sendCommand } = await import("./command");

function createCtx(): CliContext {
	return {
		api: { v2Workspace: { getFromHost: { query: getFromHost } } },
		config: { organizationId: "org-1" },
		bearer: "jwt",
		authSource: "config",
	} as unknown as CliContext;
}

beforeEach(() => {
	writeInput.mockClear();
	resolveHostTarget.mockClear();
	getFromHost.mockClear();
});

const signal = new AbortController().signal;

test("writes text verbatim by default", async () => {
	await sendCommand.run({
		ctx: createCtx(),
		options: {
			workspace: "ws-1",
			text: "ls -la",
			enter: undefined,
			host: undefined,
			local: undefined,
		},
		args: { id: "t-1" },
		signal,
	});

	expect(writeInput).toHaveBeenCalledWith({
		terminalId: "t-1",
		workspaceId: "ws-1",
		data: "ls -la",
	});
});

test("--enter appends a carriage return so the command runs", async () => {
	await sendCommand.run({
		ctx: createCtx(),
		options: {
			workspace: "ws-1",
			text: "ls -la",
			enter: true,
			host: undefined,
			local: undefined,
		},
		args: { id: "t-1" },
		signal,
	});

	expect(writeInput).toHaveBeenCalledWith({
		terminalId: "t-1",
		workspaceId: "ws-1",
		data: "ls -la\r",
	});
});
