import { afterEach, describe, expect, mock, test } from "bun:test";

let createInput: Record<string, unknown> | undefined;

mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			workspaces: {
				create: {
					mutate: async (input: Record<string, unknown>) => {
						createInput = input;
						return {
							workspace: {
								id: "ws-1",
								name: "agent-effort",
								branch: "agent/effort",
							},
							agents: [
								{
									ok: true,
									kind: "terminal",
									sessionId: "session-1",
									label: "Claude",
								},
							],
							terminals: [{ terminalId: "terminal-1", label: "Setup" }],
							alreadyExists: false,
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

const { default: createWorkspaceCommand } = await import("./command");

function invoke(
	overrides: { agent?: string; prompt?: string; effort?: string } = {},
) {
	return createWorkspaceCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			local: true,
			project: "project-1",
			name: "agent-effort",
			branch: "agent/effort",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	createInput = undefined;
});

describe("workspaces create", () => {
	test("forwards effort to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			effort: "high",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					effort: "high",
				},
			],
		});
	});

	test("surfaces workspace, agent session, and terminal ids in the message", async () => {
		const result = (await invoke({
			agent: "claude",
			prompt: "Implement the feature",
		})) as { data: { id: string }; message: string };

		expect(result.message).toContain("workspace  ws-1");
		expect(result.message).toContain("branch     agent/effort");
		expect(result.message).toContain(
			"agent      Claude — terminal session session-1",
		);
		expect(result.message).toContain("terminal   terminal-1 (Setup)");
		expect(result.data.id).toBe("ws-1");
	});

	test("rejects effort when no agent is selected", async () => {
		await expect(invoke({ effort: "high" })).rejects.toThrow(
			/--effort requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});
});
