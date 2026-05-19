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
					terminal?: {
						name?: string;
						command: string;
						taskPromptContent?: string;
						taskPromptFileName?: string;
						taskInput?: typeof TASK;
					};
				};
			};
		};

		expect(launchInput.tool).toBe("start_agent_session");
		expect(launchInput.params.request).toMatchObject({
			kind: "terminal",
			terminal: {
				name: "demo-task",
				taskPromptFileName: "task-demo-task.md",
				taskInput: TASK,
			},
		});
		// Prompt delivered via file, not inlined into the command
		expect(
			launchInput.params.request.terminal?.taskPromptContent,
		).toBeTruthy();
		expect(launchInput.params.request.terminal?.command).toContain(
			".superset/task-demo-task.md",
		);
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
					terminal?: {
						name?: string;
						command: string;
						taskPromptContent?: string;
						taskPromptFileName?: string;
					};
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
		// Prompt is delivered via file, not baked into the command
		expect(launchInput.params.request.terminal?.taskPromptContent).toBe(
			"Fix the failing tests",
		);
		expect(launchInput.params.request.terminal?.taskPromptFileName).toMatch(
			/^prompt-.+\.md$/,
		);
		expect(launchInput.params.request.terminal?.command).toContain(
			`.superset/${launchInput.params.request.terminal?.taskPromptFileName}`,
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
});
