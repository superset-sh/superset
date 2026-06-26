import { beforeEach, describe, expect, it, mock } from "bun:test";

const executeOnDeviceMock = mock(
	async (input: Record<string, unknown>) => input,
);
const getMcpContextMock = mock(() => ({ organizationId: "org-1" }));

const TASK = {
	id: "task-1",
	slug: "demo-task",
	title: "Demo Task",
	description: null,
	priority: "medium",
	statusName: "Todo",
	labels: ["desktop"],
};

let fetchedTask: typeof TASK | null = TASK;

const selectMock = mock(() => ({
	from: () => ({
		leftJoin: () => ({
			where: () => ({
				limit: async () => (fetchedTask ? [fetchedTask] : []),
			}),
		}),
	}),
}));

mock.module("@superset/db/client", () => ({
	db: {
		select: selectMock,
	},
}));

mock.module("../../utils", () => ({
	executeOnDevice: executeOnDeviceMock,
	getMcpContext: getMcpContextMock,
}));

const { register } = await import("./index");

type RegisteredToolHandler = (
	args: Record<string, unknown>,
	extra: unknown,
) => Promise<{
	content?: Array<{ text?: string }>;
	isError?: boolean;
}>;

function createHandlers() {
	const handlers = new Map<string, RegisteredToolHandler>();

	register({
		registerTool: (
			name: string,
			_config: unknown,
			nextHandler: RegisteredToolHandler,
		) => {
			handlers.set(name, nextHandler);
		},
	} as never);

	const taskHandler = handlers.get("start_agent_session");
	const promptHandler = handlers.get("start_agent_session_with_prompt");
	if (!taskHandler || !promptHandler) {
		throw new Error("session launch handlers were not registered");
	}

	return {
		taskHandler,
		promptHandler,
	};
}

describe("session launch MCP tools", () => {
	beforeEach(() => {
		fetchedTask = TASK;
		executeOnDeviceMock.mockClear();
		getMcpContextMock.mockClear();
		selectMock.mockClear();
	});

	it("registers task and prompt launch tools", () => {
		const handlers = createHandlers();

		expect(handlers.taskHandler).toBeDefined();
		expect(handlers.promptHandler).toBeDefined();
	});

	it("launches task-based sessions after fetching the task", async () => {
		const { taskHandler } = createHandlers();

		await taskHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				taskId: "task-1",
				agent: "claude",
			},
			{},
		);

		expect(selectMock).toHaveBeenCalledTimes(1);
		expect(executeOnDeviceMock).toHaveBeenCalledTimes(1);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			tool: string;
			params: {
				request: {
					kind: string;
					terminal?: { name?: string; command: string };
				};
			};
		};

		expect(launchInput.tool).toBe("start_agent_session");
		expect(launchInput.params.request).toMatchObject({
			kind: "terminal",
			terminal: {
				name: "demo-task",
			},
		});
	});

	it("launches prompt-only terminal sessions without fetching a task", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				agent: "codex",
				prompt: "  Fix the failing tests  ",
			},
			{},
		);

		expect(selectMock).not.toHaveBeenCalled();
		expect(executeOnDeviceMock).toHaveBeenCalledTimes(1);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			tool: string;
			params: {
				name?: string;
				request: {
					kind: string;
					agentType: string;
					terminal?: { name?: string; command: string };
				};
			};
		};

		expect(launchInput.tool).toBe("start_agent_session_with_prompt");
		expect(launchInput.params.name).toBe("Codex");
		expect(launchInput.params.request).toMatchObject({
			kind: "terminal",
			agentType: "codex",
			terminal: {
				name: "Codex",
			},
		});
		expect(launchInput.params.request.terminal?.command).toContain(
			"Fix the failing tests",
		);
		expect(launchInput.params.request.terminal?.command).not.toContain(
			"  Fix the failing tests  ",
		);
	});

	it("rejects whitespace-only prompt launches", async () => {
		const { promptHandler } = createHandlers();

		const result = await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				prompt: "   ",
			},
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toContain(
			"expected string to have >=1 characters",
		);
		expect(executeOnDeviceMock).not.toHaveBeenCalled();
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("requires taskId for the task-based tool", async () => {
		const { taskHandler } = createHandlers();

		const result = await taskHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				prompt: "Do work without a task",
			},
			{},
		);

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toContain("expected string");
		expect(selectMock).not.toHaveBeenCalled();
		expect(executeOnDeviceMock).not.toHaveBeenCalled();
	});

	// Reproduces #3779: prompt launches must let the device honor user-configured
	// agent presets (e.g. `claude --dangerously-skip-permissions`) instead of the
	// cloud MCP hardcoding `claude --permission-mode acceptEdits`. User preset
	// overrides live in the desktop's local DB, so the cloud MCP must hand the
	// raw prompt + agent type to the device for resolution rather than baking a
	// final command string here.
	it("forwards raw prompt and agent type so the device can apply user-configured preset overrides", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				agent: "claude",
				prompt: "Refactor the auth flow",
			},
			{},
		);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			params: {
				request: {
					agentType: string;
					terminal?: { command: string; prompt?: string };
				};
			};
		};

		expect(launchInput.params.request.agentType).toBe("claude");
		expect(launchInput.params.request.terminal?.prompt).toBe(
			"Refactor the auth flow",
		);
		expect(launchInput.params.request.terminal?.command).not.toContain(
			"--permission-mode acceptEdits",
		);
	});
});
