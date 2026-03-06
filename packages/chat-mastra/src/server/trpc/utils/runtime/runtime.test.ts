import { describe, expect, it } from "bun:test";
import {
	generateAndSetTitle,
	type RuntimeSession,
	subscribeToSessionEvents,
} from "./runtime";

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
