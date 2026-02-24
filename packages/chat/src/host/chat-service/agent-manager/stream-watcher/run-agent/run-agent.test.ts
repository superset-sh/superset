import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { UIMessageChunk } from "ai";
import type { SessionContext } from "../../session-state";
import type { SessionHost } from "../session-host";

function createAgentOutput(
	runId: string,
): ReadableStream<UIMessageChunk> & { runId: string } {
	const stream = new ReadableStream<UIMessageChunk>({
		start(controller) {
			controller.enqueue({ type: "start" } as UIMessageChunk);
			controller.close();
		},
	});
	return Object.assign(stream, { runId });
}

async function collectChunks(
	stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
	const reader = stream.getReader();
	const chunks: UIMessageChunk[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			return chunks;
		}
		chunks.push(value as UIMessageChunk);
	}
}

const superagentMocks = {
	stream: mock(async () => createAgentOutput("run-stream")),
	resumeStream: mock(async () => createAgentOutput("run-resume")),
	approveToolCall: mock(async () => createAgentOutput("run-approve")),
	declineToolCall: mock(async () => createAgentOutput("run-decline")),
};

class MockRequestContext {
	readonly entries: [string, string][];

	constructor(entries: [string, string][]) {
		this.entries = entries;
	}
}

const toAISdkStream = mock((stream: unknown) => stream);

const gatherProjectContext = mock(async () => "");
const parseFileMentions = mock(() => []);
const buildFileMentionContext = mock(() => "");
const parseTaskMentions = mock(() => []);
const buildTaskMentionContext = mock(async () => "");

const runWithProviderAuthRetry = mock(
	async <T>(
		operation: () => Promise<T>,
		_options: { modelId?: string },
	): Promise<T> => operation(),
);

mock.module("@superset/agent", () => ({
	RequestContext: MockRequestContext,
	superagent: superagentMocks,
	toAISdkStream,
}));

mock.module("./context/project-context", () => ({
	gatherProjectContext,
}));

mock.module("./context/file-mentions", () => ({
	parseFileMentions,
	buildFileMentionContext,
}));

mock.module("./context/task-mentions", () => ({
	parseTaskMentions,
	buildTaskMentionContext,
}));

mock.module("./provider-auth-retry", () => ({
	runWithProviderAuthRetry,
}));

const { runAgent, continueAgentWithToolOutput, resumeAgent } = await import(
	"./run-agent"
);
const { sessionAbortControllers, sessionContext, sessionRunIds } = await import(
	"../../session-state"
);

function createHost(): {
	host: SessionHost;
	writeStream: ReturnType<typeof mock>;
} {
	const writeStream = mock(async () => {});
	return {
		host: { writeStream } as unknown as SessionHost,
		writeStream,
	};
}

beforeEach(() => {
	superagentMocks.stream.mockClear();
	superagentMocks.resumeStream.mockClear();
	superagentMocks.approveToolCall.mockClear();
	superagentMocks.declineToolCall.mockClear();
	toAISdkStream.mockClear();
	gatherProjectContext.mockClear();
	parseFileMentions.mockClear();
	buildFileMentionContext.mockClear();
	parseTaskMentions.mockClear();
	buildTaskMentionContext.mockClear();
	runWithProviderAuthRetry.mockClear();

	sessionAbortControllers.clear();
	sessionContext.clear();
	sessionRunIds.clear();
});

describe("runAgent", () => {
	it("streams a message and persists session + run state", async () => {
		const { host, writeStream } = createHost();

		gatherProjectContext.mockResolvedValue("PROJECT");
		parseFileMentions.mockReturnValue(["foo.ts"]);
		buildFileMentionContext.mockReturnValue("FILES");
		parseTaskMentions.mockReturnValue(["task-1"]);
		buildTaskMentionContext.mockResolvedValue("TASKS");
		superagentMocks.stream.mockResolvedValue(createAgentOutput("run-123"));

		await runAgent({
			sessionId: "session-1",
			text: "hello",
			host,
			modelId: "anthropic/claude-sonnet-4-6",
			cwd: "/tmp/repo",
			permissionMode: "default",
			thinkingEnabled: true,
			apiUrl: "https://api.example.com",
			getHeaders: async () => ({ Authorization: "Bearer token" }),
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "anthropic/claude-sonnet-4-6" },
		);
		expect(superagentMocks.stream).toHaveBeenCalledTimes(1);
		expect(superagentMocks.stream).toHaveBeenCalledWith(
			"hello",
			expect.objectContaining({
				maxSteps: 100,
				memory: {
					thread: "session-1",
					resource: "session-1",
				},
				requireToolApproval: true,
				instructions: "PROJECTFILESTASKS",
				providerOptions: {
					anthropic: {
						thinking: {
							type: "enabled",
							budgetTokens: 10_000,
						},
					},
				},
			}),
		);

		expect(sessionRunIds.get("session-1")).toBe("run-123");
		expect(sessionContext.get("session-1")).toEqual({
			cwd: "/tmp/repo",
			modelId: "anthropic/claude-sonnet-4-6",
			permissionMode: "default",
			thinkingEnabled: true,
			requestEntries: [
				["modelId", "anthropic/claude-sonnet-4-6"],
				["cwd", "/tmp/repo"],
				["apiUrl", "https://api.example.com"],
				["authHeaders", JSON.stringify({ Authorization: "Bearer token" })],
				["thinkingEnabled", "true"],
			],
		});
		expect(writeStream).toHaveBeenCalledTimes(1);

		const streamArg = writeStream.mock.calls[0]?.[1] as
			| ReadableStream<UIMessageChunk>
			| undefined;
		expect(streamArg).toBeDefined();
		const chunks = await collectChunks(
			streamArg as ReadableStream<UIMessageChunk>,
		);
		const metadata = chunks[0] as {
			type: string;
			messageMetadata?: { runId?: string };
		};
		expect(metadata.type).toBe("message-metadata");
		expect(metadata.messageMetadata?.runId).toBe("run-123");
		expect(sessionAbortControllers.has("session-1")).toBe(false);
	});

	it("bypasses anthropic oauth retry for non-anthropic models", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.stream.mockResolvedValue(createAgentOutput("run-openai"));

		await runAgent({
			sessionId: "session-openai",
			text: "hello",
			host,
			modelId: "openai/gpt-4.1",
			cwd: "/tmp/repo",
			apiUrl: "https://api.example.com",
			getHeaders: async () => ({}),
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "openai/gpt-4.1" },
		);
		expect(superagentMocks.stream).toHaveBeenCalledTimes(1);
		expect(writeStream).toHaveBeenCalledTimes(1);
	});

	it("writes failure chunk/log and clears session state on stream errors", async () => {
		const { host, writeStream } = createHost();
		const error = new Error("stream failed");
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		superagentMocks.stream.mockRejectedValue(error);

		try {
			await runAgent({
				sessionId: "session-2",
				text: "hello",
				host,
				modelId: "anthropic/claude-sonnet-4-6",
				cwd: "/tmp/repo",
				apiUrl: "https://api.example.com",
				getHeaders: async () => ({}),
			});
		} finally {
			errorSpy.mockRestore();
		}

		expect(writeStream).toHaveBeenCalledTimes(1);
		const errorStream = writeStream.mock.calls[0]?.[1] as
			| ReadableStream<UIMessageChunk>
			| undefined;
		const chunks = await collectChunks(
			errorStream as ReadableStream<UIMessageChunk>,
		);
		expect((chunks[0] as { type: string; errorText?: string }).type).toBe(
			"error",
		);
		expect((chunks[0] as { errorText?: string }).errorText).toBe(
			"stream failed",
		);
		expect((chunks[1] as { type: string }).type).toBe("abort");

		expect(sessionContext.has("session-2")).toBe(false);
		expect(sessionRunIds.has("session-2")).toBe(false);
		expect(sessionAbortControllers.has("session-2")).toBe(false);
	});
});

describe("continueAgentWithToolOutput", () => {
	it("uses fallback context, normalizes toolCallId, and writes resumed stream", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.resumeStream.mockResolvedValue(createAgentOutput("run-2"));

		const fallbackContext: SessionContext = {
			cwd: "/tmp/repo",
			modelId: "anthropic/claude-sonnet-4-6",
			permissionMode: "default",
			thinkingEnabled: true,
			requestEntries: [
				["modelId", "anthropic/claude-sonnet-4-6"],
				["cwd", "/tmp/repo"],
				["apiUrl", "https://api.example.com"],
			],
		};

		await continueAgentWithToolOutput({
			sessionId: "session-3",
			host,
			runId: "run-1",
			toolCallId: "  ---tool-123 ",
			toolName: "my_tool",
			state: "output-available",
			output: { answers: { foo: "bar" } },
			fallbackContext,
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "anthropic/claude-sonnet-4-6" },
		);
		expect(superagentMocks.resumeStream).toHaveBeenCalledWith(
			{ answers: { foo: "bar" } },
			expect.objectContaining({
				runId: "run-1",
				toolCallId: "tool-123",
				maxSteps: 100,
				memory: {
					thread: "session-3",
					resource: "session-3",
				},
				requireToolApproval: true,
			}),
		);
		expect(sessionRunIds.get("session-3")).toBe("run-2");
		expect(sessionContext.get("session-3")).toEqual({
			cwd: "/tmp/repo",
			modelId: "anthropic/claude-sonnet-4-6",
			permissionMode: "default",
			thinkingEnabled: true,
			requestEntries: [
				["modelId", "anthropic/claude-sonnet-4-6"],
				["cwd", "/tmp/repo"],
				["apiUrl", "https://api.example.com"],
			],
		});
		expect(writeStream).toHaveBeenCalledTimes(1);
	});

	it("bypasses anthropic oauth retry for non-anthropic session context", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.resumeStream.mockResolvedValue(createAgentOutput("run-3"));

		const fallbackContext: SessionContext = {
			cwd: "/tmp/repo",
			modelId: "openai/gpt-4.1",
			permissionMode: "default",
			thinkingEnabled: false,
			requestEntries: [
				["modelId", "openai/gpt-4.1"],
				["cwd", "/tmp/repo"],
				["apiUrl", "https://api.example.com"],
			],
		};

		await continueAgentWithToolOutput({
			sessionId: "session-openai-continue",
			host,
			runId: "run-1",
			toolCallId: "tool-123",
			toolName: "my_tool",
			state: "output-available",
			output: { answers: { foo: "bar" } },
			fallbackContext,
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "openai/gpt-4.1" },
		);
		expect(superagentMocks.resumeStream).toHaveBeenCalledTimes(1);
		expect(writeStream).toHaveBeenCalledTimes(1);
	});
});

describe("resumeAgent", () => {
	it("updates permission mode and approves tool calls", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.approveToolCall.mockResolvedValue(
			createAgentOutput("run-approve"),
		);
		sessionContext.set("session-4", {
			cwd: "/tmp/repo",
			modelId: "anthropic/claude-sonnet-4-6",
			permissionMode: "default",
			thinkingEnabled: false,
			requestEntries: [["cwd", "/tmp/repo"]],
		});

		await resumeAgent({
			sessionId: "session-4",
			runId: "run-approve",
			host,
			approved: true,
			toolCallId: "tool-1",
			permissionMode: "acceptEdits",
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "anthropic/claude-sonnet-4-6" },
		);
		expect(superagentMocks.approveToolCall).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: "run-approve",
				toolCallId: "tool-1",
			}),
		);
		expect(sessionContext.get("session-4")?.permissionMode).toBe("acceptEdits");
		expect(writeStream).toHaveBeenCalledTimes(1);
	});

	it("declines tool calls when approved is false", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.declineToolCall.mockResolvedValue(
			createAgentOutput("run-decline"),
		);

		await resumeAgent({
			sessionId: "session-5",
			runId: "run-decline",
			host,
			approved: false,
			toolCallId: "tool-2",
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: undefined },
		);
		expect(superagentMocks.declineToolCall).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: "run-decline",
				toolCallId: "tool-2",
			}),
		);
		expect(writeStream).toHaveBeenCalledTimes(1);
	});

	it("bypasses anthropic oauth retry for non-anthropic resume", async () => {
		const { host, writeStream } = createHost();
		superagentMocks.approveToolCall.mockResolvedValue(
			createAgentOutput("run-openai-approve"),
		);
		sessionContext.set("session-openai-resume", {
			cwd: "/tmp/repo",
			modelId: "openai/gpt-4.1",
			permissionMode: "default",
			thinkingEnabled: false,
			requestEntries: [["modelId", "openai/gpt-4.1"]],
		});

		await resumeAgent({
			sessionId: "session-openai-resume",
			runId: "run-openai-approve",
			host,
			approved: true,
			toolCallId: "tool-1",
		});

		expect(runWithProviderAuthRetry).toHaveBeenCalledTimes(1);
		expect(runWithProviderAuthRetry).toHaveBeenCalledWith(
			expect.any(Function),
			{ modelId: "openai/gpt-4.1" },
		);
		expect(superagentMocks.approveToolCall).toHaveBeenCalledTimes(1);
		expect(writeStream).toHaveBeenCalledTimes(1);
	});
});
