import { beforeEach, describe, expect, mock, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";

const create = mock(
	async (
		_request: Record<string, unknown>,
	): Promise<Partial<Anthropic.Message>> => ({
		stop_reason: "end_turn",
		content: [{ type: "text", text: "Finished", citations: [] }],
	}),
);
const replies = mock(async (_request: Record<string, unknown>) => ({
	messages: [] as Array<{ ts: string; text: string }>,
	response_metadata: { next_cursor: "" },
}));
const callTool = mock(
	async (_request: {
		name: string;
		arguments: unknown;
	}): Promise<Record<string, unknown>> => ({}),
);
const cleanup = mock(async () => {});
const listTools = mock(async () => ({
	tools: ["tasks_create", "tasks_update", "tasks_delete", "terminals_send"].map(
		(name) => ({
			name,
			inputSchema: { type: "object" },
		}),
	),
}));
mock.module("@/env", () => ({ env: { ANTHROPIC_API_KEY: "test" } }));
class FakeAPIError extends Error {
	status?: number;
	headers?: Headers;
}
class FakeConnectionError extends FakeAPIError {}
class FakeTimeoutError extends FakeConnectionError {}
mock.module("@anthropic-ai/sdk", () => ({
	default: class {
		static APIError = FakeAPIError;
		static APIConnectionError = FakeConnectionError;
		static APIConnectionTimeoutError = FakeTimeoutError;
		messages = { create };
	},
}));
class FakeWebClient {
	conversations = { replies };
	users = { info: async () => ({}) };
}
mock.module("@slack/web-api", () => ({ WebClient: FakeWebClient }));
// bun shares mock.module registrations across test files in one process, so
// pin the factory here rather than inheriting whichever file mocked it last.
mock.module("../slack-client", () => ({
	createSlackClient: () => new FakeWebClient(),
	isUnpostableChannelError: () => false,
}));
mock.module("./mcp-clients", () => ({
	createSupersetMcpClient: async () => ({
		client: { callTool, listTools },
		cleanup,
	}),
	mcpToolToAnthropicTool: (tool: { name: string }, prefix: string) => ({
		name: `${prefix}_${tool.name}`,
		input_schema: { type: "object" },
	}),
	parseToolName: (name: string) => ({
		prefix: name.split("_")[0],
		toolName: name.slice(name.indexOf("_") + 1),
	}),
}));
const { fetchThreadContext, formatErrorForSlack, runSlackAgent } = await import(
	"./run-agent"
);
const params = {
	prompt: "Help",
	channelId: "C1",
	threadTs: "1.0",
	messageTs: "50.0",
	organizationId: "org",
	userId: "user",
	slackToken: "test",
};
const toolResponse = (
	name = "superset_tasks_create",
): Partial<Anthropic.Message> => ({
	stop_reason: "tool_use",
	content: [{ type: "tool_use", id: "tool-1", name, input: { title: "Task" } }],
});

beforeEach(() => {
	create.mockReset();
	create.mockImplementation(async () => ({
		stop_reason: "end_turn",
		content: [{ type: "text", text: "Finished", citations: [] }],
	}));
	replies.mockReset();
	replies.mockImplementation(async () => ({
		messages: [],
		response_metadata: { next_cursor: "" },
	}));
	callTool.mockReset();
	callTool.mockImplementation(async () => ({}));
	cleanup.mockClear();
});

describe("thread context", () => {
	test("keeps the latest replies across pages and excludes current/later messages by timestamp", async () => {
		replies.mockImplementationOnce(async () => ({
			messages: Array.from({ length: 25 }, (_, i) => ({
				ts: `${i + 1}.0`,
				text: `message-${i + 1}`,
			})),
			response_metadata: { next_cursor: "next" },
		}));
		replies.mockImplementationOnce(async () => ({
			messages: [
				{ ts: "26.0", text: "recent" },
				{ ts: "50.0", text: "current" },
				{ ts: "51.0", text: "Thinking..." },
			],
			response_metadata: { next_cursor: "" },
		}));
		const context = await fetchThreadContext({
			token: "test",
			channelId: "C1",
			threadTs: "1.0",
			messageTs: "50.0",
			limit: 20,
		});
		expect(context).toContain("20 previous messages");
		expect(context).toContain("recent");
		expect(context).not.toContain("message-6\n");
		expect(context).not.toContain("current");
		expect(context).not.toContain("Thinking...");
		expect(replies.mock.calls[1]?.[0]).toMatchObject({
			cursor: "next",
			latest: "50.0",
			inclusive: false,
		});
	});
});

describe("thread context since last turn", () => {
	test("flags messages newer than the last one the agent read", async () => {
		replies.mockImplementation(async () => ({
			messages: [
				{ ts: "1.0", text: "start" },
				{ ts: "6.0", text: "arrived later" },
				{ ts: "50.0", text: "current" },
			],
			response_metadata: { next_cursor: "" },
		}));
		const text = await fetchThreadContext({
			token: "t",
			channelId: "C1",
			threadTs: "1.0",
			messageTs: "50.0",
			sinceTs: "5.0",
		});
		expect(text).toContain("1 marked [new]");
		expect(text).toContain("[new] unknown: arrived later");
		expect(text).not.toContain("[new] unknown: start");
	});
});

describe("agent loop", () => {
	test("uses Sonnet 5 with thinking, caching and curated tools", async () => {
		await runSlackAgent(params);
		expect(create.mock.calls[0]?.[0]).toMatchObject({
			model: "claude-sonnet-5",
			thinking: { type: "adaptive" },
			system: [
				{ type: "text", cache_control: { type: "ephemeral" } },
				{ type: "text" },
			],
		});
		const requestTools = create.mock.calls[0]?.[0].tools as Array<{
			name: string;
		}>;
		expect(requestTools.map((t) => t.name)).toContain("superset_tasks_create");
		expect(requestTools.map((t) => t.name)).toContain("superset_tasks_update");
		expect(requestTools.map((t) => t.name)).not.toContain(
			"superset_tasks_delete",
		);
		expect(requestTools).toContainEqual(
			expect.objectContaining({ type: "web_search_20260209" }),
		);
		expect(create.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 0 });
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
	test("the quiet tool is offered only for a session, states the thread's mode, and flips it", async () => {
		await runSlackAgent(params);
		const plain = create.mock.calls[0]?.[0].tools as { name: string }[];
		expect(plain.map((t) => t.name)).not.toContain("slack_thread_quiet");
		create.mockReset();
		create.mockImplementationOnce(async () => ({
			stop_reason: "tool_use",
			content: [
				{
					type: "tool_use",
					id: "q1",
					name: "slack_thread_quiet",
					input: { quiet: false },
				},
			],
		}));
		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [{ type: "text", text: "Done", citations: [] }],
		}));
		const set = mock(async (_quiet: boolean) => {});
		await runSlackAgent({ ...params, threadQuiet: { quiet: true, set } });
		const first = create.mock.calls[0]?.[0] as {
			tools: { name: string }[];
			system: { text: string }[];
		};
		expect(first.tools.map((t) => t.name)).toContain("slack_thread_quiet");
		expect(first.system[1]?.text).toContain("This thread is quiet");
		expect(set).toHaveBeenCalledWith(false);
	});

	test("a model request timeout is not retried; a 5xx is retried once", async () => {
		create.mockImplementationOnce(async () => {
			throw new FakeTimeoutError("Request timed out.");
		});
		await runSlackAgent(params).catch(() => {});
		// The error rewrite also calls create; count only agent-loop requests.
		const loopCalls = () =>
			create.mock.calls.filter(([req]) => "tools" in (req as object)).length;
		expect(loopCalls()).toBe(1);

		create.mockReset();
		create.mockImplementationOnce(async () => {
			throw Object.assign(new FakeAPIError("overloaded"), { status: 500 });
		});
		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [{ type: "text", text: "Recovered", citations: [] }],
		}));
		const result = await runSlackAgent(params);
		expect(result.text).toBe("Recovered");
		expect(loopCalls()).toBe(2);

		create.mockReset();
		create.mockImplementationOnce(async () => {
			throw new FakeConnectionError("socket hang up");
		});
		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [{ type: "text", text: "Reconnected", citations: [] }],
		}));
		expect((await runSlackAgent(params)).text).toBe("Reconnected");
		expect(loopCalls()).toBe(2);
	});

	test("text split around citations comes back as one paragraph", async () => {
		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [
				{ type: "text", text: "Bun 1.4.2 fixes 7 issues", citations: [{}] },
				{ type: "text", text: ", including two regressions", citations: [{}] },
				{ type: "text", text: ".", citations: [] },
			],
		}));
		const result = await runSlackAgent(params);
		expect(result.text).toBe(
			"Bun 1.4.2 fixes 7 issues, including two regressions.",
		);

		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [
				{ type: "text", text: "Let me check.", citations: [] },
				{ type: "text", text: "Bun 1.4.2 is out", citations: [{}] },
				{ type: "text", text: ".", citations: [] },
			],
		}));
		expect((await runSlackAgent(params)).text).toBe(
			"Let me check.\n\nBun 1.4.2 is out.",
		);
	});

	test("thread memory is user-turn data, never part of the system prompt", async () => {
		await runSlackAgent({
			...params,
			threadMemory: "<thread_memory>ws X</thread_memory>",
		});
		const request = create.mock.calls[0]?.[0] as {
			system: { text: string }[];
			messages: { content: string }[];
		};
		expect(request.messages[0]?.content).toContain(
			"<thread_memory>ws X</thread_memory>",
		);
		expect(request.messages[0]?.content).toContain("Current message:\nHelp");
		for (const block of request.system)
			expect(block.text).not.toContain("ws X");
	});
	test("does not send adaptive thinking or the new web search tool to Haiku", async () => {
		await runSlackAgent({ ...params, model: "claude-haiku-4-5" });
		expect(create.mock.calls[0]?.[0]).not.toHaveProperty("thinking");
		expect(create.mock.calls[0]?.[0].tools).toContainEqual(
			expect.objectContaining({ type: "web_search_20250305" }),
		);
	});
	test("reports refusal, truncation and an empty answer with static copy, not a Haiku rewrite", async () => {
		for (const [stop, needle] of [
			["refusal", "can't help"],
			["max_tokens", "cut off"],
		] as const) {
			create.mockImplementationOnce(async () => ({
				stop_reason: stop,
				content: [{ type: "text", text: "partial", citations: [] }],
			}));
			const result = await runSlackAgent(params);
			expect(result.text).toContain(needle);
		}
		create.mockImplementationOnce(async () => ({
			stop_reason: "end_turn",
			content: [],
		}));
		expect((await runSlackAgent(params)).text).toContain("without an answer");
		// Only the model calls above; no rewrite call ever went to Haiku.
		expect(
			create.mock.calls.filter(([r]) => r.model === "claude-haiku-4-5"),
		).toHaveLength(0);
	});
	test("an exhausted deadline fails with static copy and keeps completed actions", async () => {
		const realNow = Date.now;
		let now = realNow();
		Date.now = () => now;
		try {
			create.mockImplementationOnce(async () => toolResponse());
			// The tool call outlives the budget, so the next model call must not start.
			callTool.mockImplementation(async ({ name }) => {
				if (name !== "tasks_create") return {};
				now += 200;
				return {
					structuredContent: {
						task: { id: "task", title: "Task", slug: "SUP-1" },
					},
				};
			});
			const result = await runSlackAgent({ ...params, deadline: now + 100 });
			expect(result.text).toContain("ran out of time");
			expect(result.actions).toHaveLength(1);
		} finally {
			Date.now = realNow;
		}
	});
	test("bounds every MCP request by the remaining budget", async () => {
		create.mockImplementationOnce(async () => toolResponse());
		await runSlackAgent({ ...params, deadline: Date.now() + 30_000 });
		const timeouts = callTool.mock.calls.map(
			(call) => (call[2] as { timeout?: number } | undefined)?.timeout,
		);
		expect(timeouts.length).toBeGreaterThanOrEqual(4);
		for (const timeout of timeouts) {
			expect(timeout).toBeGreaterThan(0);
			expect(timeout).toBeLessThanOrEqual(30_000);
		}
		expect(listTools.mock.calls[0]?.[1]).toMatchObject({
			timeout: expect.any(Number),
		});
	});
	test("starts no MCP request once the deadline has passed", async () => {
		listTools.mockClear();
		const result = await runSlackAgent({ ...params, deadline: Date.now() - 1 });
		expect(result.text).toContain("ran out of time");
		expect(listTools).not.toHaveBeenCalled();
	});
	test("skips the error rewrite when the budget is nearly spent", async () => {
		const text = await formatErrorForSlack(
			new Error("boom"),
			Date.now() + 5_000,
		);
		expect(text).toContain("something went wrong");
		expect(create).not.toHaveBeenCalled();
	});
	test("enforces tool policy at execution, even for a hallucinated destructive tool", async () => {
		create.mockImplementationOnce(async () =>
			toolResponse("superset_tasks_delete"),
		);
		await runSlackAgent(params);
		expect(callTool.mock.calls.map(([arg]) => arg.name)).not.toContain(
			"tasks_delete",
		);
	});
	test("propagates MCP errors and never records failed writes as actions", async () => {
		create.mockImplementationOnce(async () => toolResponse());
		callTool.mockImplementation(async ({ name }) =>
			name === "tasks_create"
				? {
						isError: true,
						content: [{ type: "text", text: "Permission denied" }],
						structuredContent: { task: { id: "bad" } },
					}
				: {},
		);
		const result = await runSlackAgent(params);
		expect(result.actions).toEqual([]);
		const messages = create.mock.calls[1]?.[0].messages as Array<{
			content: unknown;
		}>;
		expect(messages.at(-1)?.content).toMatchObject([{ is_error: true }]);
	});
	test("retains server search and thinking blocks when continuing with client tools", async () => {
		const content = [
			{ type: "thinking", thinking: "Plan", signature: "signed" },
			{
				type: "server_tool_use",
				id: "search-1",
				name: "web_search",
				input: { query: "test" },
			},
			...(toolResponse().content ?? []),
		] as Anthropic.ContentBlock[];
		create.mockImplementationOnce(async () => ({
			stop_reason: "tool_use",
			content,
		}));
		await runSlackAgent(params);
		const messages = create.mock.calls[1]?.[0].messages as Array<{
			content: unknown;
		}>;
		expect(messages[1]?.content).toEqual(content);
	});
	test.each([
		["max_tokens", "cut off"],
		["refusal", "can't help"],
		["pause_turn", "ran out of steps"],
	] as const)("does not post unfinished text on %s", async (reason, needle) => {
		create.mockImplementation(async () => ({
			stop_reason: reason,
			content: [{ type: "text", text: "I will delete it", citations: [] }],
		}));
		const result = await runSlackAgent(params);
		expect(result.text).toContain(needle);
		expect(cleanup).toHaveBeenCalledTimes(1);
	});
	test("caps client tool iterations and retains completed action records", async () => {
		create.mockImplementation(async () => toolResponse());
		callTool.mockImplementation(async ({ name }) =>
			name === "tasks_create"
				? {
						structuredContent: {
							task: { id: "task", title: "Task", slug: "SUP-1" },
						},
					}
				: {},
		);
		const result = await runSlackAgent(params);
		expect(result.text).toContain("ran out of steps");
		expect(result.actions).toHaveLength(10);
		expect(
			callTool.mock.calls.filter(([arg]) => arg.name === "tasks_create"),
		).toHaveLength(10);
	});
});
