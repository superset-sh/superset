import { describe, expect, it, mock } from "bun:test";
import type { RuntimeSession } from "./runtime";

const generateTitleFromMessageMock = mock(
	(async ({
		agent,
		message,
	}: {
		agent: {
			generateTitleFromUserMessage?: (input: {
				message: string;
			}) => Promise<string>;
		};
		message: string;
	}) => agent.generateTitleFromUserMessage?.({ message }) ?? "") as (
		args: unknown,
	) => Promise<string>,
);

mock.module("../../../desktop", () => ({
	generateTitleFromMessage: generateTitleFromMessageMock,
}));

const {
	generateAndSetTitle,
	restartRuntimeFromUserMessage,
	subscribeToSessionEvents,
} = await import("./runtime");

function createRuntimeForTest(): {
	runtime: RuntimeSession;
	emit: (event: unknown) => void;
} {
	let listener: ((event: unknown) => void) | null = null;

	const harness = {
		subscribe: (cb: (event: unknown) => void) => {
			listener = cb;
			return () => {};
		},
		listMessages: async () => [],
		getCurrentMode: () => ({
			agent: {
				generateTitleFromUserMessage: async () => "",
			},
		}),
		getFullModelId: () => "anthropic/claude-opus-4-6",
	} as RuntimeSession["harness"];

	const runtime: RuntimeSession = {
		sessionId: "11111111-1111-1111-1111-111111111111",
		harness,
		mcpManager: null as RuntimeSession["mcpManager"],
		hookManager: null as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		lastErrorMessage: null,
		pendingSandboxQuestion: null,
		cwd: "/tmp",
	};

	subscribeToSessionEvents(runtime);

	return {
		runtime,
		emit: (event: unknown) => {
			if (!listener) throw new Error("Harness listener was not registered");
			listener(event);
		},
	};
}

interface RuntimeTestMessage {
	role: string;
	content: Array<{ type: string; text?: string }>;
}

function createRuntimeForTitleTest(options?: {
	messages?: RuntimeTestMessage[];
	generatedTitle?: string;
}): {
	runtime: RuntimeSession;
	apiClient: Parameters<typeof generateAndSetTitle>[1];
	updateTitleInputs: Array<{ sessionId: string; title: string }>;
} {
	const updateTitleInputs: Array<{ sessionId: string; title: string }> = [];
	const messages = options?.messages ?? [];
	const generatedTitle = options?.generatedTitle ?? "";

	const runtime: RuntimeSession = {
		sessionId: "11111111-1111-1111-1111-111111111111",
		harness: {
			subscribe: () => () => {},
			listMessages: async () => messages,
			getCurrentMode: () => ({
				agent: {
					generateTitleFromUserMessage: async () => generatedTitle,
				},
			}),
			getFullModelId: () => "anthropic/claude-opus-4-6",
		} as RuntimeSession["harness"],
		mcpManager: null as RuntimeSession["mcpManager"],
		hookManager: null as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		lastErrorMessage: null,
		pendingSandboxQuestion: null,
		cwd: "/tmp",
	};

	const apiClient = {
		chat: {
			updateTitle: {
				mutate: async (input: { sessionId: string; title: string }) => {
					updateTitleInputs.push(input);
					return { updated: true };
				},
			},
		},
	} as unknown as Parameters<typeof generateAndSetTitle>[1];

	return { runtime, apiClient, updateTitleInputs };
}

describe("runtime error propagation", () => {
	it("restores Superset session id after Mastra thread events", () => {
		const { runtime, emit } = createRuntimeForTest();
		const setSessionId = {
			calls: [] as string[],
		};
		runtime.hookManager = {
			setSessionId: (sessionId: string) => {
				setSessionId.calls.push(sessionId);
			},
		} as RuntimeSession["hookManager"];

		emit({ type: "thread_created", thread: { id: "thread-1" } });
		emit({ type: "thread_changed", threadId: "thread-2" });

		expect(setSessionId.calls).toEqual([
			"11111111-1111-1111-1111-111111111111",
			"11111111-1111-1111-1111-111111111111",
		]);
	});

	it("extracts nested provider message from error.data.error.message", () => {
		const { runtime, emit } = createRuntimeForTest();
		emit({
			type: "error",
			error: {
				data: {
					error: {
						message: "Invalid bearer token",
					},
				},
			},
		});
		expect(runtime.lastErrorMessage).toBe("Invalid bearer token");
	});

	it("extracts provider message from responseBody JSON", () => {
		const { runtime, emit } = createRuntimeForTest();
		emit({
			type: "error",
			error: {
				responseBody:
					'{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
			},
		});
		expect(runtime.lastErrorMessage).toBe("invalid x-api-key");
	});

	it("clears last error on agent_start", () => {
		const { runtime, emit } = createRuntimeForTest();
		emit({
			type: "error",
			error: {
				data: {
					error: {
						message: "Invalid bearer token",
					},
				},
			},
		});
		expect(runtime.lastErrorMessage).toBe("Invalid bearer token");

		emit({ type: "agent_start" });
		expect(runtime.lastErrorMessage).toBeNull();
	});

	it("captures sandbox_access_request as pending sandbox question", () => {
		const { runtime, emit } = createRuntimeForTest();
		emit({
			type: "sandbox_access_request",
			questionId: "sandbox_1",
			path: "/Users/test/Desktop",
			reason: "Need to list files",
		});
		expect(runtime.pendingSandboxQuestion).toEqual({
			questionId: "sandbox_1",
			path: "/Users/test/Desktop",
			reason: "Need to list files",
		});
	});

	it("clears pending sandbox question on agent_start", () => {
		const { runtime, emit } = createRuntimeForTest();
		emit({
			type: "sandbox_access_request",
			questionId: "sandbox_1",
			path: "/Users/test/Desktop",
			reason: "Need to list files",
		});
		expect(runtime.pendingSandboxQuestion).not.toBeNull();

		emit({ type: "agent_start" });
		expect(runtime.pendingSandboxQuestion).toBeNull();
	});
});

describe("runtime title generation", () => {
	it("uses submitted user message when history has no persisted user messages", async () => {
		const { runtime, apiClient, updateTitleInputs } = createRuntimeForTitleTest(
			{
				messages: [],
				generatedTitle: "Title from submit payload",
			},
		);

		await generateAndSetTitle(runtime, apiClient, {
			submittedUserMessage: "Title source from current submit",
		});

		expect(updateTitleInputs).toEqual([
			{
				sessionId: "11111111-1111-1111-1111-111111111111",
				title: "Title from submit payload",
			},
		]);
	});

	it("does not double-count submitted message when already persisted", async () => {
		const { runtime, apiClient, updateTitleInputs } = createRuntimeForTitleTest(
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "duplicate-safe message" }],
					},
				],
				generatedTitle: "Title from deduped submit",
			},
		);

		await generateAndSetTitle(runtime, apiClient, {
			submittedUserMessage: "duplicate-safe message",
		});

		expect(updateTitleInputs).toEqual([
			{
				sessionId: "11111111-1111-1111-1111-111111111111",
				title: "Title from deduped submit",
			},
		]);
	});

	it("ignores malformed text parts without a text string", async () => {
		const { runtime, apiClient, updateTitleInputs } = createRuntimeForTitleTest(
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text" }],
					},
				],
				generatedTitle: "should not be used",
			},
		);

		await generateAndSetTitle(runtime, apiClient);

		expect(updateTitleInputs).toEqual([]);
	});
});

describe("runtime message restart", () => {
	it("clones the thread up to the target user message and resends from there", async () => {
		const cloneThreadInputs: Array<Record<string, unknown>> = [];
		const sendMessageInputs: Array<Record<string, unknown>> = [];
		const switchThreadInputs: Array<Record<string, unknown>> = [];
		const switchModelInputs: Array<Record<string, unknown>> = [];

		const memoryStore = {
			getThreadById: async () => ({
				id: "thread-1",
				resourceId: "resource-1",
				title: "Existing Thread",
			}),
			listMessages: async () => ({
				messages: [
					{ id: "user-1", role: "user" },
					{ id: "assistant-1", role: "assistant" },
					{ id: "user-2", role: "user" },
					{ id: "assistant-2", role: "assistant" },
				],
			}),
			cloneThread: async (input: Record<string, unknown>) => {
				cloneThreadInputs.push(input);
				return {
					thread: {
						id: "thread-2",
						resourceId: "resource-1",
						title: "Existing Thread",
					},
				};
			},
		};

		const runtime: RuntimeSession = {
			sessionId: "11111111-1111-1111-1111-111111111111",
			harness: {
				getCurrentThreadId: () => "thread-1",
				abort: () => {},
				switchThread: async (input: Record<string, unknown>) => {
					switchThreadInputs.push(input);
				},
				switchModel: async (input: Record<string, unknown>) => {
					switchModelInputs.push(input);
				},
				sendMessage: async (input: Record<string, unknown>) => {
					sendMessageInputs.push(input);
				},
				config: {
					storage: {
						getStore: async () => memoryStore,
					},
				},
			} as unknown as RuntimeSession["harness"],
			mcpManager: null as RuntimeSession["mcpManager"],
			hookManager: null as RuntimeSession["hookManager"],
			mcpManualStatuses: new Map(),
			lastErrorMessage: "stale error",
			pendingSandboxQuestion: null,
			cwd: "/tmp",
		};

		await restartRuntimeFromUserMessage(runtime, {
			messageId: "user-2",
			payload: {
				content: "Edited prompt",
			},
			metadata: {
				model: "anthropic/claude-sonnet-4",
			},
		});

		expect(cloneThreadInputs).toEqual([
			{
				sourceThreadId: "thread-1",
				resourceId: "resource-1",
				title: "Existing Thread",
				options: {
					messageFilter: {
						messageIds: ["user-1", "assistant-1"],
					},
				},
			},
		]);
		expect(switchThreadInputs).toEqual([{ threadId: "thread-2" }]);
		expect(switchModelInputs).toEqual([
			{
				modelId: "anthropic/claude-sonnet-4",
				scope: "thread",
			},
		]);
		expect(sendMessageInputs).toEqual([{ content: "Edited prompt" }]);
		expect(runtime.lastErrorMessage).toBeNull();
	});
});
