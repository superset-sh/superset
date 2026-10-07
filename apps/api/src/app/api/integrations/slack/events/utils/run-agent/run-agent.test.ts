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
const resolveTarget = mock(
	async (_request: {
		plugin: string;
		userId: string;
		organizationId: string | null;
	}): Promise<Record<string, unknown> | null> => null,
);
const pluginListTools = mock(
	async (
		..._args: unknown[]
	): Promise<Array<{ name: string; inputSchema?: unknown }>> => [],
);
const pluginCallTool = mock(
	async (..._args: unknown[]): Promise<Record<string, unknown>> => ({}),
);
mock.module("@/env", () => ({ env: { ANTHROPIC_API_KEY: "test" } }));
class FakeAPIError extends Error {
	status?: number;
	headers?: Headers;
}
class FakeConnectionError extends FakeAPIError {}
class FakeTimeoutError extends FakeConnectionError {}
class FakePluginTargetError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}
class FakeAmbiguousPluginError extends Error {}
// The real in-memory client/server pair runs; only target resolution and the
// two request handlers behind it are faked.
mock.module("@superset/trpc/plugins-proxy", () => ({
	AmbiguousPluginError: FakeAmbiguousPluginError,
	PluginTargetError: FakePluginTargetError,
	resolveTarget,
	buildPluginServer: async (target: { plugin: string }) => {
		const { Server } = await import(
			"@modelcontextprotocol/sdk/server/index.js"
		);
		const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
			"@modelcontextprotocol/sdk/types.js"
		);
		const server = new Server(
			{ name: target.plugin, version: "1.0.0" },
			{ capabilities: { tools: {} } },
		);
		server.setRequestHandler(
			ListToolsRequestSchema,
			async (_request, extra) => ({
				tools: await pluginListTools(target.plugin, extra?.signal),
			}),
		);
		server.setRequestHandler(CallToolRequestSchema, async (request) => ({
			...(await pluginCallTool(
				target.plugin,
				request.params.name,
				request.params.arguments ?? {},
			)),
		}));
		return server;
	},
}));
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
const {
	fetchThreadContext,
	formatErrorForSlack,
	rateLimitWaitMs,
	runSlackAgent,
} = await import("./run-agent");
const { invalidatePluginToolCache } = await import("./plugin-tools");
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
	input: Record<string, unknown> = { title: "Task" },
): Partial<Anthropic.Message> => ({
	stop_reason: "tool_use",
	content: [{ type: "tool_use", id: "tool-1", name, input }],
});
const pluginContext = (
	pluginName: string,
	version = "1.0.0",
	connectionId = `${pluginName}-install`,
) => ({
	kind: "first-party" as const,
	plugin: pluginName,
	version,
	connectionId,
});
/** Resolve only the named plugins; everything else reads as not connected. */
const connectPlugins = (
	...targets: Array<ReturnType<typeof pluginContext>>
) => {
	resolveTarget.mockImplementation(async ({ plugin }) => {
		const match = targets.find((target) => target.plugin === plugin);
		return match ?? { kind: "needs-auth", plugin, version: "0.0.0" };
	});
};
const textResult = (value: unknown) => ({
	content: [{ type: "text", text: JSON.stringify(value) }],
});
const requestToolNames = (call = 0) =>
	((create.mock.calls[call]?.[0].tools ?? []) as Array<{ name: string }>).map(
		(t) => t.name,
	);
const contextualSystemText = (call = 0) =>
	((create.mock.calls[call]?.[0].system ?? []) as Array<{ text: string }>)[1]
		?.text ?? "";

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
	resolveTarget.mockReset();
	connectPlugins();
	pluginListTools.mockReset();
	pluginListTools.mockImplementation(async () => []);
	pluginCallTool.mockReset();
	pluginCallTool.mockImplementation(async () => ({}));
	invalidatePluginToolCache();
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

	test("rateLimitWaitMs reads delay-seconds or an HTTP-date, bounded", () => {
		const headers = (v: string | null) => ({ headers: { get: () => v } });
		const now = Date.parse("2026-09-16T08:00:00Z");
		expect(rateLimitWaitMs(headers("3"), now)).toBe(3_000);
		expect(rateLimitWaitMs(headers("Wed, 16 Sep 2026 08:00:04 GMT"), now)).toBe(
			4_000,
		);
		expect(rateLimitWaitMs(headers("Wed, 16 Sep 2026 07:59:00 GMT"), now)).toBe(
			2_000,
		);
		expect(rateLimitWaitMs(headers("120"), now)).toBe(10_000);
		expect(rateLimitWaitMs(headers(null), now)).toBe(2_000);
	});

	test("a stop request ends the turn with the stopped copy and keeps completed actions", async () => {
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
		// First check (before the first request) passes; the stop lands before
		// the second request, after one tool call has completed.
		let checks = 0;
		const result = await runSlackAgent({
			...params,
			shouldStop: async () => ++checks > 2,
		});
		expect(result.text).toContain("Stopped");
		expect(result.actions).toHaveLength(1);
		expect(
			create.mock.calls.filter(([req]) => "tools" in (req as object)),
		).toHaveLength(1);
	});

	test("a stop that lands mid-batch prevents the next tool call", async () => {
		create.mockImplementationOnce(async () => ({
			stop_reason: "tool_use",
			content: [
				{
					type: "tool_use",
					id: "a",
					name: "superset_tasks_create",
					input: { title: "one" },
				},
				{
					type: "tool_use",
					id: "b",
					name: "superset_tasks_create",
					input: { title: "two" },
				},
			],
		}));
		// The context prefetch also calls tools; only the task call flips the flag.
		let stop = false;
		callTool.mockImplementation(async ({ name }) => {
			if (name !== "tasks_create") return {};
			stop = true;
			return {
				structuredContent: { task: { id: "t", title: "one", slug: "S-1" } },
			};
		});
		const result = await runSlackAgent({
			...params,
			shouldStop: async () => stop,
		});
		expect(result.text).toContain("Stopped");
		expect(
			callTool.mock.calls.filter(([a]) => a.name === "tasks_create"),
		).toHaveLength(1);
		expect(result.actions).toHaveLength(1);
	});

	test("a truncated answer is posted with a cut-off note, not replaced by it", async () => {
		create.mockImplementationOnce(async () => ({
			stop_reason: "max_tokens",
			content: [
				{ type: "text", text: "• SUPER-1 first\n• SUPER-2 sec", citations: [] },
			],
		}));
		const result = await runSlackAgent(params);
		expect(result.text).toStartWith("• SUPER-1 first");
		expect(result.text).toContain("cut off");
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

describe("plugin tools", () => {
	const linearListing = [
		{ name: "list_issues", inputSchema: { type: "object" } },
		{ name: "save_issue", inputSchema: { type: "object" } },
		{ name: "delete_comment", inputSchema: { type: "object" } },
	];
	const githubListing = [
		{ name: "create_pull_request", inputSchema: { type: "object" } },
		{ name: "merge_pull_request", inputSchema: { type: "object" } },
	];
	const listingFor = async (plugin: unknown) =>
		plugin === "linear" ? linearListing : githubListing;

	test("registers curated tools for connected plugins only and briefs the model", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(listingFor);
		const result = await runSlackAgent({
			...params,
			prompt: "Find my GitHub PRs and file a Linear issue",
		});
		const names = requestToolNames();
		expect(names).toContain("linear_list_issues");
		expect(names).toContain("linear_save_issue");
		expect(names).not.toContain("linear_delete_comment");
		expect(names.some((name) => name.startsWith("github_"))).toBe(false);
		expect(names).toContain("superset_tasks_create");
		expect(contextualSystemText()).toContain("Linear is connected");
		expect(contextualSystemText()).toContain("GitHub is not connected");
		expect(result.unconnectedPlugins.map((p) => p.name)).toEqual(["github"]);
		expect(resolveTarget).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "user", organizationId: "org" }),
		);
	});

	test("says nothing about a plugin that is neither connected nor asked for", async () => {
		const result = await runSlackAgent(params);
		expect(contextualSystemText()).not.toContain("connected");
		expect(result.unconnectedPlugins.map((p) => p.name)).toEqual([
			"linear",
			"github",
		]);
		expect(pluginListTools).not.toHaveBeenCalled();
	});

	test("refuses a plugin tool outside the curated subset at execution", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(listingFor);
		create.mockImplementationOnce(async () =>
			toolResponse("linear_delete_comment", { id: "c1" }),
		);
		await runSlackAgent(params);
		expect(pluginCallTool).not.toHaveBeenCalled();
		const messages = create.mock.calls[1]?.[0].messages as Array<{
			content: unknown;
		}>;
		expect(messages.at(-1)?.content).toMatchObject([{ is_error: true }]);
	});

	test("refuses a curated tool for a plugin the user has not connected", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(listingFor);
		create.mockImplementationOnce(async () =>
			toolResponse("github_create_pull_request", { title: "Fix" }),
		);
		await runSlackAgent(params);
		expect(pluginCallTool).not.toHaveBeenCalled();
	});

	test("routes linear_* calls to that connection with the remaining budget and records the issue", async () => {
		connectPlugins(pluginContext("linear"), pluginContext("github"));
		pluginListTools.mockImplementation(listingFor);
		create.mockImplementationOnce(async () =>
			toolResponse("linear_save_issue", { team: "SUP", title: "Bug" }),
		);
		pluginCallTool.mockImplementation(async () =>
			textResult({
				id: "SUP-12",
				uuid: "uuid",
				title: "Bug",
				url: "https://linear.app/acme/issue/SUP-12/bug",
			}),
		);
		const result = await runSlackAgent({
			...params,
			deadline: Date.now() + 30_000,
		});
		expect(pluginCallTool).toHaveBeenCalledTimes(1);
		const [plugin, tool, args] = pluginCallTool.mock.calls[0] ?? [];
		expect(plugin).toBe("linear");
		expect(tool).toBe("save_issue");
		expect(args).toEqual({ team: "SUP", title: "Bug" });
		expect(result.actions).toEqual([
			{
				type: "issue_created",
				issues: [
					{
						identifier: "SUP-12",
						title: "Bug",
						url: "https://linear.app/acme/issue/SUP-12/bug",
					},
				],
			},
		]);
	});

	test("an issue update through save_issue is not reported as a creation", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(listingFor);
		create.mockImplementationOnce(async () =>
			toolResponse("linear_save_issue", { id: "SUP-12", title: "Renamed" }),
		);
		pluginCallTool.mockImplementation(async () =>
			textResult({ id: "SUP-12", title: "Renamed", url: "https://l/SUP-12" }),
		);
		const result = await runSlackAgent(params);
		expect(pluginCallTool).toHaveBeenCalledTimes(1);
		expect(result.actions).toEqual([]);
	});

	test("records an opened pull request from GitHub's minimal response", async () => {
		connectPlugins(pluginContext("github"));
		pluginListTools.mockImplementation(listingFor);
		create.mockImplementationOnce(async () =>
			toolResponse("github_create_pull_request", {
				owner: "acme",
				repo: "app",
				title: "Fix login",
				head: "fix",
				base: "main",
			}),
		);
		pluginCallTool.mockImplementation(async () =>
			textResult({ id: "1", url: "https://github.com/acme/app/pull/42" }),
		);
		const result = await runSlackAgent(params);
		expect(requestToolNames()).not.toContain("github_merge_pull_request");
		expect(result.actions).toEqual([
			{
				type: "pr_opened",
				pullRequests: [
					{
						number: 42,
						title: "Fix login",
						url: "https://github.com/acme/app/pull/42",
					},
				],
			},
		]);
	});

	test("a failure resolving plugin connections leaves the run with Superset tools only", async () => {
		resolveTarget.mockImplementation(async ({ plugin }) => {
			if (plugin === "linear") throw new Error("ambiguous install");
			return { kind: "needs-auth", plugin, version: "0.0.0" };
		});
		const result = await runSlackAgent({
			...params,
			prompt: "file this in Linear",
		});
		expect(result.text).toBe("Finished");
		const names = requestToolNames();
		expect(names.some((n) => n.startsWith("linear_"))).toBe(false);
		expect(names).toContain("superset_tasks_create");
		// Unknown is not unconnected: no Connect prompt, no "not connected" line.
		expect(result.unconnectedPlugins).toEqual([]);
		expect(contextualSystemText()).not.toContain("is not connected");
		expect(contextualSystemText()).toContain("Linear could not be checked");
	});

	test("mentionsPlugin matches whole terms only", async () => {
		const { mentionsPlugin, SLACK_PLUGINS } = await import("./run-agent");
		const linear = SLACK_PLUGINS.find((p) => p.name === "linear");
		if (!linear) throw new Error("linear plugin missing");
		expect(mentionsPlugin("file it in linear please", linear)).toBe(true);
		expect(mentionsPlugin("Linear: MOB-1", linear)).toBe(true);
		expect(mentionsPlugin("this growth is nonlinear", linear)).toBe(false);
		expect(mentionsPlugin("linearize the model", linear)).toBe(false);
	});
	test("a failing plugin listing skips that plugin without failing the run or calling it unconnected", async () => {
		connectPlugins(pluginContext("linear"), pluginContext("github"));
		pluginListTools.mockImplementation(async (plugin) => {
			if (plugin === "github") {
				throw new Error("Upstream returned 502 Bad Gateway");
			}
			return linearListing;
		});
		const result = await runSlackAgent(params);
		expect(result.text).toBe("Finished");
		const names = requestToolNames();
		expect(names).toContain("linear_list_issues");
		expect(names.some((name) => name.startsWith("github_"))).toBe(false);
		expect(contextualSystemText()).toContain(
			"GitHub is connected but its tools could not be loaded",
		);
		expect(result.unconnectedPlugins).toEqual([]);
	});

	test("a plugin whose listing hangs costs that plugin, not the turn", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(
			(_plugin: unknown, signal?: unknown) =>
				new Promise((_resolve, reject) => {
					(signal as AbortSignal | undefined)?.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		);
		const started = Date.now();
		const result = await runSlackAgent({
			...params,
			pluginDiscoveryTimeoutMs: 50,
		});
		expect(Date.now() - started).toBeLessThan(5_000);
		expect(result.text).toBe("Finished");
		expect(requestToolNames()).toContain("superset_tasks_create");
		expect(requestToolNames()).not.toContain("linear_list_issues");
	});

	test("the tool cache is per installation, not per plugin name", async () => {
		pluginListTools.mockImplementation(listingFor);
		connectPlugins(pluginContext("linear"));
		await runSlackAgent(params);
		connectPlugins(pluginContext("linear", "1.0.0", "install-2"));
		await runSlackAgent(params);
		expect(pluginListTools).toHaveBeenCalledTimes(2);
	});

	test("caches a plugin's tool listing across runs for the same plugin version and auth method", async () => {
		connectPlugins(pluginContext("linear"));
		pluginListTools.mockImplementation(listingFor);
		await runSlackAgent(params);
		await runSlackAgent(params);
		expect(pluginListTools).toHaveBeenCalledTimes(1);
		expect(requestToolNames(1)).toContain("linear_list_issues");

		connectPlugins(pluginContext("linear", "1.1.0"));
		await runSlackAgent(params);
		expect(pluginListTools).toHaveBeenCalledTimes(2);
	});
});
