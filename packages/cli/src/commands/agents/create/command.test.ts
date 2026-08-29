import { afterEach, describe, expect, mock, test } from "bun:test";

let runInput: Record<string, unknown> | undefined;

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
			agents: {
				run: {
					mutate: async (input: Record<string, unknown>) => {
						runInput = input;
						return {
							kind: "terminal",
							terminalId: "terminal-1",
							sessionId: "terminal-1",
							label: "Codex",
							agent: {
								presetId: "codex",
								sessionId: null,
								resumable: false,
								state: "starting",
								lastEventType: null,
								lastEventAt: null,
								startedAt: null,
								ended: false,
								endedAt: null,
								endReason: null,
							},
						};
					},
				},
			},
		},
	}),
}));

mock.module("../../../lib/upload-attachments", () => ({
	uploadAttachments: async () => [],
}));

const { default: createAgentCommand } = await import("./command");

function invoke(
	effort?: string,
	overrides: Record<string, unknown> = { prompt: "Review this diff" },
) {
	return createAgentCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			workspace: "00000000-0000-4000-8000-000000000001",
			host: "host-1",
			agent: "codex",
			effort,
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	runInput = undefined;
});

describe("agents create", () => {
	test("forwards an explicit reasoning effort to the host", async () => {
		await invoke("xhigh");

		expect(runInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			agent: "codex",
			prompt: "Review this diff",
			effort: "xhigh",
			attachmentIds: undefined,
		});
	});

	test("leaves effort unset so the agent uses its own default", async () => {
		await invoke();

		expect(runInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			agent: "codex",
			prompt: "Review this diff",
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("resumes a previous session without a prompt", async () => {
		await invoke(undefined, { resumeSession: "abc-123" });

		expect(runInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			agent: "codex",
			prompt: "",
			resumeSessionId: "abc-123",
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("rejects a launch with neither prompt nor resume session", async () => {
		await expect(invoke(undefined, {})).rejects.toThrow(/Missing --prompt/);
		expect(runInput).toBeUndefined();
	});

	test("names the launched id a terminal, and points at the read command", async () => {
		const { message } = (await invoke()) as { message: string };

		expect(message).toContain("terminal terminal-1");
		// The provider conversation id is not knowable yet — say where it will be.
		expect(message).toContain("superset agents get");
		expect(message).toContain("--terminal terminal-1");
	});
});
