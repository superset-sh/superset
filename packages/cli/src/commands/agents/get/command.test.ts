import { afterEach, describe, expect, mock, test } from "bun:test";

let getInput: Record<string, unknown> | undefined;
let getResult: unknown;

mock.module("../../../lib/host-workspaces", () => ({
	findWorkspaceOnHost: async () => ({
		hostId: "host-1",
		workspace: { id: "00000000-0000-4000-8000-000000000001" },
	}),
}));

mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			terminalAgents: {
				get: {
					query: async (input: Record<string, unknown>) => {
						getInput = input;
						return getResult;
					},
				},
			},
		},
	}),
}));

const { default: getAgentCommand } = await import("./command");

async function invoke(
	overrides: Record<string, unknown> = {},
): Promise<{ data: unknown; message: string }> {
	return (await getAgentCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			workspace: "00000000-0000-4000-8000-000000000001",
			terminal: "term-1",
			host: "host-1",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	})) as { data: unknown; message: string };
}

const PARKED_CODEX = {
	kind: "terminal",
	terminalId: "term-1",
	workspaceId: "00000000-0000-4000-8000-000000000001",
	terminalStatus: "exited",
	agent: {
		presetId: "codex",
		sessionId: "0199a4f1-thread-2f6b",
		resumable: true,
		state: "ended",
		lastEventType: "Stop",
		lastEventAt: "2026-08-29T00:00:00.000Z",
		startedAt: "2026-08-28T23:00:00.000Z",
		ended: true,
		endedAt: "2026-08-29T00:01:00.000Z",
		endReason: "terminal-exited",
	},
};

afterEach(() => {
	getInput = undefined;
	getResult = undefined;
});

describe("agents get", () => {
	test("asks the host for the terminal's binding", async () => {
		getResult = PARKED_CODEX;
		await invoke();

		expect(getInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			terminalId: "term-1",
		});
	});

	test("returns the binding unchanged for --json consumers", async () => {
		getResult = PARKED_CODEX;
		const result = await invoke();

		expect(result.data).toEqual(PARKED_CODEX);
	});

	test("prints the provider session id separately from the terminal id", async () => {
		getResult = PARKED_CODEX;
		const { message } = await invoke();

		expect(message).toContain("terminalId");
		expect(message).toContain("term-1");
		expect(message).toContain("agent.sessionId");
		expect(message).toContain("0199a4f1-thread-2f6b");
		expect(message).toContain("agent.presetId");
		expect(message).toContain("codex");
		expect(message).toContain("agent.resumable");
		expect(message).toContain("agent.state");
		expect(message).toContain("ended");
	});

	test("says so plainly when no agent is bound to the terminal", async () => {
		getResult = {
			kind: "terminal",
			terminalId: "term-1",
			workspaceId: "00000000-0000-4000-8000-000000000001",
			terminalStatus: "active",
			agent: null,
		};
		const { message } = await invoke();

		expect(message).toContain("no agent bound");
		expect(message).not.toContain("agent.sessionId");
	});

	test("rejects a call without an active organization", async () => {
		getResult = PARKED_CODEX;
		await expect(
			getAgentCommand.run({
				ctx: { config: {}, bearer: "bearer" } as never,
				args: {} as never,
				options: {
					workspace: "00000000-0000-4000-8000-000000000001",
					terminal: "term-1",
				} as never,
				signal: new AbortController().signal,
			}),
		).rejects.toThrow(/No active organization/);
	});
});
