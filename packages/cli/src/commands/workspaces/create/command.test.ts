import { afterEach, describe, expect, mock, test } from "bun:test";

let createInput: Record<string, unknown> | undefined;
/** Per-launch outcomes the mocked host returns in `agents[]`. */
let agentsResult: { ok: boolean; error?: string }[] | undefined;

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
							workspace: { id: "ws-1", name: "agent-effort" },
							agents: agentsResult,
							alreadyExists: false,
						};
					},
				},
				createSession: {
					mutate: async (input: Record<string, unknown>) => {
						createInput = input;
						return {
							workspace: { id: "ws-1", name: "agent-effort" },
							agents: agentsResult,
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
		prompt?: string;
		effort?: string;
		tag?: string[];
		project?: string | undefined;
		branch?: string | undefined;
		model?: string;
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
	agentsResult = undefined;
});

describe("workspaces create", () => {
	test("forwards model to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			model: "sonnet",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					model: "sonnet",
				},
			],
		});
	});

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

	test("forwards repeatable --tag values as the tags set", async () => {
		await invoke({ tag: ["Perf Work", "infra"] });
		expect(createInput).toMatchObject({ tags: ["Perf Work", "infra"] });
	});

	test("omits tags entirely when --tag is not passed", async () => {
		await invoke();
		expect(createInput).not.toHaveProperty("tags");
	});

	test("rejects --tag on a project-less session", async () => {
		await expect(
			invoke({ project: undefined, branch: undefined, tag: ["perf"] }),
		).rejects.toThrow(/--tag requires --project/);
		expect(createInput).toBeUndefined();
	});

	test("rejects model when no agent is selected", async () => {
		await expect(invoke({ model: "sonnet" })).rejects.toThrow(
			/--model requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});

	test("fails when the requested agent never launched (#5767)", async () => {
		agentsResult = [{ ok: false, error: "no agent config for `claude`" }];

		await expect(
			invoke({ agent: "claude", prompt: "Implement the feature" }),
		).rejects.toThrow(/Agent launch failed: no agent config for `claude`/);
		expect(createInput).toMatchObject({ agents: [{ agent: "claude" }] });
	});

	test("names the surviving workspace so the caller can retry or clean up", async () => {
		agentsResult = [{ ok: false, error: "spawn failed" }];

		const error = await invoke({
			agent: "claude",
			prompt: "Implement the feature",
		}).catch((err: Error & { suggestion?: string }) => err);

		expect((error as { suggestion?: string }).suggestion).toContain("ws-1");
	});

	test("retry hint includes --host so remote creates stay retryable", async () => {
		agentsResult = [{ ok: false, error: "spawn failed" }];

		const error = await invoke({
			agent: "claude",
			prompt: "Implement the feature",
		}).catch((err: Error & { suggestion?: string }) => err);

		expect((error as { suggestion?: string }).suggestion).toContain(
			"--host host-1",
		);
	});

	test("reports every failed launch, not just the first", async () => {
		agentsResult = [
			{ ok: false, error: "first failure" },
			{ ok: false, error: "second failure" },
		];

		await expect(
			invoke({ agent: "claude", prompt: "Implement the feature" }),
		).rejects.toThrow(/first failure; second failure/);
	});

	test("fails a project-less session the same way", async () => {
		agentsResult = [{ ok: false, error: "spawn failed" }];

		await expect(
			invoke({
				project: undefined,
				branch: undefined,
				agent: "claude",
				prompt: "Implement the feature",
			}),
		).rejects.toThrow(/Agent launch failed: spawn failed/);
	});

	test("succeeds when the agent launched", async () => {
		agentsResult = [{ ok: true }];

		const result = await invoke({
			agent: "claude",
			prompt: "Implement the feature",
		});

		expect(result).toMatchObject({
			message: expect.stringContaining("Created workspace"),
		});
	});

	test("succeeds when no agent was requested", async () => {
		const result = await invoke();

		expect(result).toMatchObject({
			message: expect.stringContaining("Created workspace"),
		});
	});
});
