import { afterEach, describe, expect, mock, test } from "bun:test";

let runInput: Record<string, unknown> | undefined;
let transcriptInput: Record<string, unknown> | undefined;
let transcriptText = "";
let transcriptFails = false;
let bindings: Array<Record<string, unknown>> = [];

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
			terminal: {
				transcript: {
					query: async (input: Record<string, unknown>) => {
						transcriptInput = input;
						if (transcriptFails) throw new Error("host unreachable");
						return { text: transcriptText, source: "stream", streamBytes: 42 };
					},
				},
			},
			terminalAgents: {
				listByWorkspace: { query: async () => bindings },
			},
			settings: {
				agentConfigs: {
					list: {
						query: async () => [
							{ id: "config-1", presetId: "claude", label: "Claude" },
						],
					},
				},
			},
			agents: {
				run: {
					mutate: async (input: Record<string, unknown>) => {
						runInput = input;
						return {
							kind: "terminal",
							sessionId: "terminal-1",
							label: "Codex",
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
	transcriptInput = undefined;
	transcriptText = "";
	transcriptFails = false;
	bindings = [];
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

	test("forks a previous session without a prompt", async () => {
		await invoke(undefined, { forkSession: "thread-source" });

		expect(runInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			agent: "codex",
			prompt: "",
			forkSessionId: "thread-source",
			effort: undefined,
			attachmentIds: undefined,
		});
	});

	test("rejects combining resume and fork", async () => {
		await expect(
			invoke(undefined, {
				resumeSession: "thread-source",
				forkSession: "thread-source",
			}),
		).rejects.toThrow(/Choose one session operation/);
		expect(runInput).toBeUndefined();
	});

	test("rejects a launch with no prompt or session operation", async () => {
		await expect(invoke(undefined, {})).rejects.toThrow(/Missing --prompt/);
		expect(runInput).toBeUndefined();
	});

	test("seeds the launch with the source terminal's context", async () => {
		transcriptText = "$ bun test\n42 pass";
		bindings = [
			{
				terminalId: "terminal-source",
				agentId: "claude",
				definitionId: null,
				agentSessionId: "session-1",
			},
		];

		await invoke(undefined, { fromTerminal: "terminal-source" });

		expect(transcriptInput).toEqual({
			workspaceId: "00000000-0000-4000-8000-000000000001",
			terminalId: "terminal-source",
		});
		const prompt = String(runInput?.prompt);
		expect(prompt).toContain(
			"Continue the work from a previous Claude terminal session.",
		);
		expect(prompt).toContain("Source terminal: terminal-source");
		expect(prompt).toContain("$ bun test\n42 pass");
	});

	test("hands off from a terminal with no agent binding", async () => {
		transcriptText = "some shell output";

		await invoke(undefined, { fromTerminal: "terminal-source" });

		expect(String(runInput?.prompt)).toContain(
			"Continue the work from a previous terminal session.",
		);
	});

	test("fails when the source terminal has no output yet", async () => {
		transcriptText = "";

		await expect(
			invoke(undefined, { fromTerminal: "terminal-source" }),
		).rejects.toThrow(/has no output to hand off yet/);
		expect(runInput).toBeUndefined();
	});

	test("reports a failed read separately from an empty terminal", async () => {
		transcriptFails = true;

		await expect(
			invoke(undefined, { fromTerminal: "terminal-source" }),
		).rejects.toThrow(/Couldn't read terminal terminal-source/);
		expect(runInput).toBeUndefined();
	});

	test("rejects combining a handoff with an explicit prompt", async () => {
		await expect(
			invoke(undefined, {
				fromTerminal: "terminal-source",
				prompt: "do the thing",
			}),
		).rejects.toThrow(/builds its own prompt/);
		expect(runInput).toBeUndefined();
	});

	test("rejects combining a handoff with a fork", async () => {
		await expect(
			invoke(undefined, {
				fromTerminal: "terminal-source",
				forkSession: "thread-source",
			}),
		).rejects.toThrow(/Choose one session operation/);
		expect(runInput).toBeUndefined();
	});
});
