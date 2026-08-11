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
							workspace: { name: "agent-effort" },
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
	overrides: {
		agent?: string;
		branch?: string;
		effort?: string;
		pr?: number;
		prompt?: string;
	} = {},
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

	test("rejects effort when no agent is selected", async () => {
		await expect(invoke({ effort: "high" })).rejects.toThrow(
			/--effort requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});

	test("requires exactly one branch source", async () => {
		await expect(invoke({ branch: undefined })).rejects.toThrow(
			/Specify exactly one of --branch or --pr/,
		);
		await expect(invoke({ pr: 123 })).rejects.toThrow(
			/Specify exactly one of --branch or --pr/,
		);
		expect(createInput).toBeUndefined();
	});
});
