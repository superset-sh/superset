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
const {
	START_AGENT_SESSION_TOOL_NAME,
	START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
	START_AGENT_SESSION_TOOL_NAMES,
} = await import("./shared");

type RegisteredToolHandler = (
	args: Record<string, unknown>,
	extra: unknown,
) => Promise<{
	content?: Array<{ text?: string }>;
	isError?: boolean;
}>;

type RegisteredToolConfig = {
	description: string;
	inputSchema: Record<string, unknown>;
};

function createHandlers() {
	const handlers = new Map<string, RegisteredToolHandler>();
	const configs = new Map<string, RegisteredToolConfig>();

	register({
		registerTool: (
			name: string,
			config: RegisteredToolConfig,
			nextHandler: RegisteredToolHandler,
		) => {
			handlers.set(name, nextHandler);
			configs.set(name, config);
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
		handlers,
		configs,
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

	it("tool name sent to executeOnDevice matches the desktop tool registry name", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				agent: "claude",
				prompt: "Hello world",
			},
			{},
		);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			tool: string;
		};

		// The tool name sent via executeOnDevice must exactly match what the
		// desktop command watcher registers in its tool registry, otherwise
		// the desktop returns "Unknown tool: <name>" (see #2707).
		expect(launchInput.tool).toBe(START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME);
		expect(launchInput.tool).toBe("start_agent_session_with_prompt");
	});

	it("registers prompt tool with correct inputSchema containing prompt field", () => {
		const { configs } = createHandlers();

		const promptConfig = configs.get("start_agent_session_with_prompt");
		expect(promptConfig).toBeDefined();
		expect(promptConfig?.inputSchema).toHaveProperty("prompt");
		expect(promptConfig?.inputSchema).toHaveProperty("deviceId");
		expect(promptConfig?.inputSchema).toHaveProperty("workspaceId");
		expect(promptConfig?.inputSchema).not.toHaveProperty("taskId");

		const taskConfig = configs.get("start_agent_session");
		expect(taskConfig).toBeDefined();
		expect(taskConfig?.inputSchema).toHaveProperty("taskId");
		expect(taskConfig?.inputSchema).not.toHaveProperty("prompt");
	});

	it("launches superset-chat prompt sessions with chat kind", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				agent: "superset-chat",
				prompt: "Summarize the codebase",
			},
			{},
		);

		expect(executeOnDeviceMock).toHaveBeenCalledTimes(1);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			tool: string;
			params: {
				request: {
					kind: string;
					agentType: string;
					chat?: { initialPrompt?: string };
				};
			};
		};

		expect(launchInput.tool).toBe("start_agent_session_with_prompt");
		expect(launchInput.params.request).toMatchObject({
			kind: "chat",
			agentType: "superset-chat",
			chat: {
				initialPrompt: "Summarize the codebase",
			},
		});
	});

	it("defaults agent to claude when not specified for prompt launches", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				prompt: "Hello",
			},
			{},
		);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			params: {
				agentType: string;
				request: { agentType: string };
			};
		};

		expect(launchInput.params.agentType).toBe("claude");
		expect(launchInput.params.request.agentType).toBe("claude");
	});

	it("exports tool names array containing both tool names", () => {
		expect(START_AGENT_SESSION_TOOL_NAMES).toContain("start_agent_session");
		expect(START_AGENT_SESSION_TOOL_NAMES).toContain(
			"start_agent_session_with_prompt",
		);
		expect(START_AGENT_SESSION_TOOL_NAMES).toHaveLength(2);
	});

	it("passes paneId through to executeOnDevice when provided", async () => {
		const { promptHandler } = createHandlers();

		await promptHandler(
			{
				deviceId: "device-1",
				workspaceId: "workspace-1",
				paneId: "pane-42",
				agent: "claude",
				prompt: "Hello",
			},
			{},
		);

		const launchInput = executeOnDeviceMock.mock.calls[0]?.[0] as {
			params: {
				paneId?: string;
				request: {
					terminal?: { paneId?: string };
				};
			};
		};

		expect(launchInput.params.paneId).toBe("pane-42");
	});
});
