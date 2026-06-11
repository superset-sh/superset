import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import {
	type StandaloneChatProvider,
	StandaloneChatRuntimeManager,
} from "./standalone-runtime";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;
type PersistedMessage = {
	id: string;
	role: "user" | "assistant";
	content: Array<Record<string, unknown>>;
	createdAt: Date;
	stopReason?: "end_turn" | "error" | "aborted";
	errorMessage?: string;
};
type FakeModelProvider = {
	id: string;
	name: string;
	protocol: "anthropic" | "openai-chat" | "openai-responses";
	baseUrl: string;
	enabled: boolean;
	hasSecret: boolean;
	secret: string | null;
	models: Array<{
		id: string;
		providerId: string;
		modelId: string;
		displayName: string;
		enabled: boolean;
		capabilities: Record<string, unknown>;
	}>;
	createdAt: Date;
	updatedAt: Date;
};

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalStandaloneChatHomeDir =
	process.env.SUPERSET_STANDALONE_CHAT_HOME_DIR;
const originalHome = process.env.HOME;
const originalPwd = process.env.PWD;
const originalInitCwd = process.env.INIT_CWD;
const originalOldPwd = process.env.OLDPWD;
let temporarySupersetHomeDir: string | null = null;
let temporaryHomeDir: string | null = null;

function createApiClient(options?: {
	updateTitleInputs?: Array<{ sessionId: string; title: string }>;
	persistedMessages?: PersistedMessage[];
	listMessagesQuery?: () => Promise<PersistedMessage[]>;
	appendMessageInputs?: Array<unknown>;
	modelProviders?: FakeModelProvider[];
}) {
	const updateTitleInputs = options?.updateTitleInputs ?? [];
	const appendMessageInputs = options?.appendMessageInputs ?? [];

	return {
		modelProvider: {
			syncPayload: {
				query: mock(async () => options?.modelProviders ?? []),
			},
		},
		chat: {
			updateTitle: {
				mutate: mock(async (input: { sessionId: string; title: string }) => {
					updateTitleInputs.push(input);
				}),
			},
			updateSession: {
				mutate: mock(async () => {}),
			},
			listMessages: {
				query: mock(
					async () =>
						options?.listMessagesQuery?.() ?? options?.persistedMessages ?? [],
				),
			},
			appendMessage: {
				mutate: mock(async (input: unknown) => {
					appendMessageInputs.push(input);
				}),
			},
			deleteMessagesFrom: {
				mutate: mock(async () => {}),
			},
		},
	} as unknown as ApiClient;
}

function createStaticProvider(
	response = "可以，我们先从服务商和模型选择链路排查。",
) {
	const calls: Array<Parameters<StandaloneChatProvider["sendTurn"]>[0]> = [];
	const provider: StandaloneChatProvider = {
		sendTurn: mock(async (args) => {
			calls.push(args);
			args.onEvent({ type: "text-delta", text: response });
			return { text: response, reasoningText: "" };
		}),
	};
	return { provider, calls };
}

async function waitForTitleUpdate(
	updateTitleInputs: Array<{ sessionId: string; title: string }>,
	count = 1,
) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (updateTitleInputs.length >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error("Timed out waiting for chat title update");
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	console.warn = originalWarn;
	if (temporarySupersetHomeDir) {
		rmSync(temporarySupersetHomeDir, { recursive: true, force: true });
		temporarySupersetHomeDir = null;
	}
	if (temporaryHomeDir) {
		rmSync(temporaryHomeDir, { recursive: true, force: true });
		temporaryHomeDir = null;
	}
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalStandaloneChatHomeDir === undefined) {
		delete process.env.SUPERSET_STANDALONE_CHAT_HOME_DIR;
	} else {
		process.env.SUPERSET_STANDALONE_CHAT_HOME_DIR =
			originalStandaloneChatHomeDir;
	}
	if (originalHome === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = originalHome;
	}
	if (originalPwd === undefined) {
		delete process.env.PWD;
	} else {
		process.env.PWD = originalPwd;
	}
	if (originalInitCwd === undefined) {
		delete process.env.INIT_CWD;
	} else {
		process.env.INIT_CWD = originalInitCwd;
	}
	if (originalOldPwd === undefined) {
		delete process.env.OLDPWD;
	} else {
		process.env.OLDPWD = originalOldPwd;
	}
});

describe("StandaloneChatRuntimeManager title generation", () => {
	it("uses the first user sentence as the title without a separate title model request", async () => {
		const updateTitleInputs: Array<{ sessionId: string; title: string }> = [];
		const { provider, calls } = createStaticProvider();

		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ updateTitleInputs }),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: {
				content:
					"我记得GPT聊天 的时候 它这个聊天标题好像不是某一句话吧 好像是个简短的对话总结。",
			},
			metadata: { model: "gpt-5.5" },
		});
		await waitForTitleUpdate(updateTitleInputs);

		expect(updateTitleInputs).toEqual([
			{
				sessionId: SESSION_ID,
				title:
					"我记得GPT聊天 的时候 它这个聊天标题好像不是某一句话吧 好像是个简短的对话总结",
			},
		]);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.modelId).toBe("gpt-5.5");
	});

	it("uses a clean first-message title", async () => {
		console.warn = mock(() => {}) as unknown as typeof console.warn;
		const updateTitleInputs: Array<{ sessionId: string; title: string }> = [];
		const { provider } = createStaticProvider("正常回复。");

		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ updateTitleInputs }),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "帮我总结一下Superset的Chat改造方向。" },
			metadata: { model: "gpt-5.5" },
		});
		await waitForTitleUpdate(updateTitleInputs);

		expect(updateTitleInputs).toEqual([
			{
				sessionId: SESSION_ID,
				title: "帮我总结一下Superset的Chat改造方向",
			},
		]);
	});

	it("streams assistant content through currentMessage before the response finishes", async () => {
		const updateTitleInputs: Array<{ sessionId: string; title: string }> = [];
		let finishProvider!: () => void;
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				args.onEvent({ type: "text-delta", text: "第一段" });
				await new Promise<void>((resolve) => {
					finishProvider = resolve;
				});
				args.onEvent({ type: "text-delta", text: "第二段" });
				return { text: "第一段第二段", reasoningText: "" };
			}),
		};

		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ updateTitleInputs }),
			provider,
		);
		const sendPromise = manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "测试流式输出。" },
			metadata: { model: "gpt-5.5" },
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		const displayState = manager.getDisplayState(SESSION_ID);
		expect(displayState.currentMessage?.content).toContainEqual({
			type: "text",
			text: "第一段",
		});

		finishProvider();
		await sendPromise;

		expect(
			(await manager.listMessages(SESSION_ID)).at(-1)?.content,
		).toContainEqual({ type: "text", text: "第一段第二段" });
	});

	it("persists reasoning content with the completed assistant turn", async () => {
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				args.onEvent({ type: "reasoning-delta", text: "先判断意图。" });
				args.onEvent({ type: "text-delta", text: "这是回答。" });
				return {
					text: "这是回答。",
					reasoningText: "先判断意图。",
				};
			}),
		};
		const appendMessageInputs: Array<unknown> = [];
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ appendMessageInputs }),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "测试 thinking 保留。" },
			metadata: { model: "claude-sonnet-4-6", thinkingLevel: "high" },
		});

		const content = (await manager.listMessages(SESSION_ID)).at(-1)?.content;
		expect(content).toContainEqual({ type: "reasoning", text: "先判断意图。" });
		expect(content).toContainEqual({ type: "text", text: "这是回答。" });
		expect(appendMessageInputs.at(-1)).toMatchObject({
			role: "assistant",
			content: expect.arrayContaining([
				{ type: "reasoning", text: "先判断意图。" },
				{ type: "text", text: "这是回答。" },
			]),
		});
	});

	it("streams and persists Claude tool calls with matching tool results", async () => {
		let finishProvider!: () => void;
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				args.onEvent({
					type: "tool-call",
					id: "toolu_01",
					name: "Bash",
					args: {},
				});
				args.onEvent({
					type: "tool-call",
					id: "toolu_01",
					name: "Bash",
					args: {
						command: "pwd",
						description: "Print current directory",
					},
				});
				await new Promise<void>((resolve) => {
					finishProvider = resolve;
				});
				args.onEvent({
					type: "tool-result",
					id: "toolu_01",
					name: "Bash",
					result: {
						stdout: "/Users/bichengyu\n",
						stderr: "",
						exitCode: 0,
					},
					isError: false,
				});
				args.onEvent({
					type: "text-delta",
					text: "/Users/bichengyu",
				});
				return {
					text: "/Users/bichengyu",
					reasoningText: "",
				};
			}),
		};
		const appendMessageInputs: Array<unknown> = [];
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ appendMessageInputs }),
			provider,
		);

		const sendPromise = manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "Run pwd." },
			metadata: { model: "gpt-5.5", permissionMode: "auto" },
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(
			manager.getDisplayState(SESSION_ID).currentMessage?.content,
		).toContainEqual({
			type: "tool_call",
			id: "toolu_01",
			name: "Bash",
			args: {
				command: "pwd",
				description: "Print current directory",
			},
		});

		finishProvider();
		await sendPromise;

		expect((await manager.listMessages(SESSION_ID)).at(-1)?.content).toEqual(
			expect.arrayContaining([
				{
					type: "tool_call",
					id: "toolu_01",
					name: "Bash",
					args: {
						command: "pwd",
						description: "Print current directory",
					},
				},
				{
					type: "tool_result",
					id: "toolu_01",
					name: "Bash",
					result: {
						stdout: "/Users/bichengyu\n",
						stderr: "",
						exitCode: 0,
					},
					isError: false,
				},
				{ type: "text", text: "/Users/bichengyu" },
			]),
		);
		const persistedAssistantMessage = appendMessageInputs.at(-1) as {
			role?: string;
			content?: Array<Record<string, unknown>>;
		};
		expect(persistedAssistantMessage.role).toBe("assistant");
		expect(persistedAssistantMessage.content).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "tool_call",
					name: "Bash",
				}),
				expect.objectContaining({
					type: "tool_result",
					name: "Bash",
					isError: false,
				}),
				{ type: "text", text: "/Users/bichengyu" },
			]),
		);
	});

	it("surfaces standalone tool approval requests and resumes after approval", async () => {
		let approvalDecision: string | null = null;
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				const approval = await args.requestToolApproval({
					toolCallId: "toolu_approval",
					toolName: "Bash",
					args: {
						command: "pwd",
					},
					title: "Claude wants to run pwd",
					displayName: "Run shell command",
					description: "Claude will execute a shell command.",
					signal: args.signal,
				});
				approvalDecision = approval.decision;
				args.onEvent({ type: "text-delta", text: "approved" });
				return { text: "approved", reasoningText: "" };
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		const sendPromise = manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "Run pwd with approval." },
			metadata: { model: "gpt-5.5", permissionMode: "default" },
		});

		for (let attempt = 0; attempt < 20; attempt += 1) {
			if (manager.getDisplayState(SESSION_ID).pendingApproval) break;
			await new Promise((resolve) => setTimeout(resolve, 5));
		}

		expect(manager.getDisplayState(SESSION_ID).pendingApproval).toEqual({
			toolCallId: "toolu_approval",
			toolName: "Bash",
			args: {
				command: "pwd",
			},
			title: "Claude wants to run pwd",
			displayName: "Run shell command",
			description: "Claude will execute a shell command.",
		});

		await manager.respondToApproval(SESSION_ID, { decision: "approve" });
		await sendPromise;

		expect(approvalDecision).toBe("approve");
		expect(manager.getDisplayState(SESSION_ID).pendingApproval).toBeNull();
		expect((await manager.listMessages(SESSION_ID)).at(-1)?.content).toEqual(
			expect.arrayContaining([
				{
					type: "permission_requested",
					id: "permission-toolu_approval",
					toolCallId: "toolu_approval",
					toolName: "Bash",
					args: { command: "pwd" },
					title: "Claude wants to run pwd",
					displayName: "Run shell command",
					description: "Claude will execute a shell command.",
				},
				{
					type: "permission_resolved",
					id: "permission-resolution-toolu_approval",
					requestId: "permission-toolu_approval",
					toolCallId: "toolu_approval",
					toolName: "Bash",
					decision: "approve",
				},
				{ type: "text", text: "approved" },
			]),
		);
	});

	it("records model, mode, branch, and URL context timeline metadata", async () => {
		const { provider } = createStaticProvider("ok");
		globalThis.fetch = mock(async () => {
			return new Response(
				"<html><title>Example</title><body>Hello</body></html>",
				{
					status: 200,
					headers: { "content-type": "text/html; charset=utf-8" },
				},
			);
		}) as unknown as typeof fetch;
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "看看 https://example.com/a" },
			metadata: {
				model: "gpt-5.5",
				permissionMode: "default",
			},
		});

		const content = (await manager.listMessages(SESSION_ID)).at(-1)?.content;
		expect(content).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "model_changed",
					provider: "Claude Code",
					model: "gpt-5.5",
				}),
				expect.objectContaining({
					type: "mode_changed",
					provider: "Claude Code",
					mode: "default",
				}),
				expect.objectContaining({
					type: "context_attachment",
					kind: "url",
					title: "https://example.com/a",
					url: "https://example.com/a",
				}),
				expect.objectContaining({
					type: "branch_marker",
					label: "Branch conversations",
					status: "placeholder",
				}),
			]),
		);
	});

	it("streams and persists tool progress and subagent timeline events", async () => {
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				args.onEvent({
					type: "tool-call",
					id: "toolu_task",
					name: "Task",
					args: { prompt: "Investigate memory usage" },
				});
				args.onEvent({
					type: "tool-progress",
					id: "toolu_task",
					name: "Task",
					elapsedTimeSeconds: 3,
					status: "running",
					taskId: "task-1",
				});
				args.onEvent({
					type: "subagent-event",
					id: "task-1",
					taskId: "task-1",
					toolCallId: "toolu_task",
					status: "progress",
					description: "Reading process list",
					subagentType: "general-purpose",
					lastToolName: "Bash",
					usage: {
						totalTokens: 1200,
						toolUses: 2,
						durationMs: 5000,
					},
				});
				args.onEvent({ type: "text-delta", text: "done" });
				return { text: "done", reasoningText: "" };
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "Run a subagent." },
			metadata: { model: "gpt-5.5", permissionMode: "auto" },
		});

		expect((await manager.listMessages(SESSION_ID)).at(-1)?.content).toEqual(
			expect.arrayContaining([
				{
					type: "tool_progress",
					id: "tool-progress-toolu_task",
					toolCallId: "toolu_task",
					toolName: "Task",
					elapsedTimeSeconds: 3,
					status: "running",
					taskId: "task-1",
				},
				{
					type: "subagent_event",
					id: "subagent-task-1",
					taskId: "task-1",
					toolCallId: "toolu_task",
					status: "progress",
					description: "Reading process list",
					subagentType: "general-purpose",
					lastToolName: "Bash",
					usage: {
						totalTokens: 1200,
						toolUses: 2,
						durationMs: 5000,
					},
				},
			]),
		);
	});

	it("normalizes tool-like subagent events into tool progress events", async () => {
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				args.onEvent({
					type: "subagent-event",
					id: "local-bash-task",
					taskId: "local-bash-task",
					status: "completed",
					description: "Calculate large home directory sizes",
					subagentType: "local_bash",
				});
				args.onEvent({ type: "text-delta", text: "done" });
				return { text: "done", reasoningText: "" };
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "Run local shell." },
			metadata: { model: "gpt-5.5", permissionMode: "auto" },
		});

		const content = (await manager.listMessages(SESSION_ID)).at(-1)?.content;
		expect(content).toEqual(
			expect.arrayContaining([
				{
					type: "tool_progress",
					id: "tool-progress-local-bash-task",
					toolCallId: "local-bash-task",
					toolName: "local_bash",
					status: "completed",
					summary: "Calculate large home directory sizes",
					taskId: "local-bash-task",
				},
			]),
		);
		expect(
			content?.some(
				(part) =>
					part.type === "subagent_event" && part.subagentType === "local_bash",
			),
		).toBe(false);
	});

	it("records decline decisions in the permission timeline", async () => {
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async (args) => {
				const approval = await args.requestToolApproval({
					toolCallId: "toolu_decline",
					toolName: "Write",
					args: {
						file_path: "/tmp/superset-deny.txt",
						content: "deny",
					},
					title: "Claude wants to write a file",
					signal: args.signal,
				});
				args.onEvent({
					type: "text-delta",
					text: approval.decision === "decline" ? "declined" : "approved",
				});
				return { text: "declined", reasoningText: "" };
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		const sendPromise = manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "Try writing a file." },
			metadata: { model: "gpt-5.5", permissionMode: "default" },
		});

		for (let attempt = 0; attempt < 20; attempt += 1) {
			if (manager.getDisplayState(SESSION_ID).pendingApproval) break;
			await new Promise((resolve) => setTimeout(resolve, 5));
		}

		await manager.respondToApproval(SESSION_ID, { decision: "decline" });
		await sendPromise;

		expect((await manager.listMessages(SESSION_ID)).at(-1)?.content).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "permission_requested",
					toolCallId: "toolu_decline",
					toolName: "Write",
				}),
				{
					type: "permission_resolved",
					id: "permission-resolution-toolu_decline",
					requestId: "permission-toolu_decline",
					toolCallId: "toolu_decline",
					toolName: "Write",
					decision: "decline",
					message: "User declined the tool request.",
				},
			]),
		);
	});

	it("passes model and thinking selections to the Claude-compatible provider", async () => {
		const { provider, calls } = createStaticProvider("ok");
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "hello" },
			metadata: {
				model: "claude-opus-4-8",
				thinkingLevel: "xhigh",
				permissionMode: "bypassPermissions",
			},
		});

		expect(calls[0]?.modelId).toBe("claude-opus-4-8");
		expect(calls[0]?.thinkingLevel).toBe("xhigh");
		expect(calls[0]?.permissionMode).toBe("bypassPermissions");
	});

	it("resolves selected model provider credentials into per-chat Claude settings and env", async () => {
		temporarySupersetHomeDir = mkdtempSync(
			join(tmpdir(), "superset-standalone-chat-"),
		);
		process.env.SUPERSET_HOME_DIR = temporarySupersetHomeDir;
		process.env.PWD = "/Users/bichengyu/Documents/toolProject/superset";
		process.env.INIT_CWD = "/Users/bichengyu/Documents/toolProject/superset";
		process.env.OLDPWD = "/Users/bichengyu/Documents/toolProject/superset";
		const providerId = "22222222-2222-4222-8222-222222222222";
		const { provider, calls } = createStaticProvider("ok");
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({
				modelProviders: [
					{
						id: providerId,
						name: "Superset Relay",
						protocol: "openai-chat",
						baseUrl: "http://38.246.229.64:8317",
						enabled: true,
						hasSecret: true,
						secret: "test-secret",
						models: [
							{
								id: "model-row-1",
								providerId,
								modelId: "deepseek-v4-pro",
								displayName: "deepseek-v4-pro",
								enabled: true,
								capabilities: {},
							},
						],
						createdAt: new Date("2026-06-11T00:00:00.000Z"),
						updatedAt: new Date("2026-06-11T00:00:00.000Z"),
					},
				],
			}),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: { content: "hello" },
			metadata: {
				model: "deepseek-v4-pro",
				modelProviderId: providerId,
				modelProviderName: "Superset Relay",
				modelProviderProtocol: "openai-chat",
				permissionMode: "bypassPermissions",
			},
		});

		const call = calls[0];
		const expectedChatCwd = join(temporarySupersetHomeDir, "chat", SESSION_ID);
		expect(call?.modelId).toBe("deepseek-v4-pro");
		expect(call?.cwd).toBe(expectedChatCwd);
		expect(call?.modelProvider).toEqual({
			id: providerId,
			name: "Superset Relay",
			protocol: "openai-chat",
			baseUrl: "http://38.246.229.64:8317",
		});
		expect(call?.env).toMatchObject({
			ANTHROPIC_AUTH_TOKEN: "test-secret",
			ANTHROPIC_BASE_URL: "http://38.246.229.64:8317",
			ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-pro",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro",
			ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro",
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
			CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
			ENABLE_TOOL_SEARCH: "true",
			PWD: expectedChatCwd,
			INIT_CWD: expectedChatCwd,
			OLDPWD: expectedChatCwd,
		});

		const settings = JSON.parse(
			readFileSync(
				join(
					temporarySupersetHomeDir,
					"chat",
					SESSION_ID,
					".claude",
					"settings.local.json",
				),
				"utf-8",
			),
		) as { env: Record<string, string> };
		expect(settings.env).toMatchObject({
			ANTHROPIC_BASE_URL: "http://38.246.229.64:8317",
			ANTHROPIC_AUTH_TOKEN: "test-secret",
			ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro",
		});
		expect((await manager.listMessages(SESSION_ID)).at(-1)?.content).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "model_changed",
					provider: "Superset Relay",
					model: "deepseek-v4-pro",
				}),
			]),
		);
	});

	it("keeps dev standalone chat cwd outside repo-local superset-dev-data", async () => {
		temporarySupersetHomeDir = mkdtempSync(
			join(tmpdir(), "superset-repo-dev-"),
		);
		process.env.SUPERSET_HOME_DIR = join(
			temporarySupersetHomeDir,
			"superset-dev-data",
		);
		process.env.PWD = "/Users/bichengyu/Documents/toolProject/superset";
		process.env.INIT_CWD = "/Users/bichengyu/Documents/toolProject/superset";
		process.env.OLDPWD = "/Users/bichengyu/Documents/toolProject/superset";
		const sessionId = crypto.randomUUID();
		const { provider, calls } = createStaticProvider("ok");
		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId,
			payload: { content: "hello" },
			metadata: {
				model: "gpt-5.5",
				permissionMode: "bypassPermissions",
			},
		});

		const expectedChatCwd = join(homedir(), ".superset", "dev-chat", sessionId);
		expect(calls[0]?.cwd).toBe(expectedChatCwd);
		expect(expectedChatCwd).not.toContain("superset-dev-data");
		expect(expectedChatCwd).not.toContain(
			"/Users/bichengyu/Documents/toolProject/superset",
		);
		expect(calls[0]?.env).toMatchObject({
			PWD: expectedChatCwd,
			INIT_CWD: expectedChatCwd,
			OLDPWD: expectedChatCwd,
		});
		rmSync(expectedChatCwd, { recursive: true, force: true });
	});

	it("fetches URL context before asking the provider", async () => {
		const { provider, calls } = createStaticProvider(
			"这篇页面摘录显示论文讨论 URL-aware chat retrieval。",
		);
		globalThis.fetch = mock(async (url: string | URL | Request) => {
			const urlText = String(url);
			if (urlText === "https://arxiv.org/html/2603.23509v1") {
				return new Response(
					[
						"<html>",
						"<head><title>Test arXiv Paper</title>",
						'<meta name="description" content="A compact paper abstract." />',
						"</head>",
						"<body><article><h1>Test arXiv Paper</h1>",
						"<p>This paper studies URL-aware chat retrieval.</p>",
						"</article></body></html>",
					].join(""),
					{
						status: 200,
						headers: { "content-type": "text/html; charset=utf-8" },
					},
				);
			}

			throw new Error(`Unexpected fetch: ${urlText}`);
		}) as unknown as typeof fetch;

		const manager = new StandaloneChatRuntimeManager(
			createApiClient(),
			provider,
		);

		await manager.sendMessage({
			sessionId: SESSION_ID,
			payload: {
				content: "解读一下 https://arxiv.org/html/2603.23509v1",
			},
			metadata: { model: "gpt-5.5" },
		});

		expect(calls).toHaveLength(1);
		const messages = calls[0]?.messages;
		expect(messages).toContainEqual(
			expect.objectContaining({
				role: "system",
				content: expect.stringContaining("Test arXiv Paper"),
			}),
		);
		expect(messages).toContainEqual(
			expect.objectContaining({
				role: "system",
				content: expect.stringContaining(
					"This paper studies URL-aware chat retrieval.",
				),
			}),
		);
	});

	it("persists provider errors as assistant error messages", async () => {
		const appendMessageInputs: Array<unknown> = [];
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async () => {
				throw new Error("Claude runtime is not configured");
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ appendMessageInputs }),
			provider,
		);

		await expect(
			manager.sendMessage({
				sessionId: SESSION_ID,
				payload: { content: "hello" },
				metadata: { model: "claude-sonnet-4-6" },
			}),
		).rejects.toThrow("Claude runtime is not configured");

		expect(appendMessageInputs.at(-1)).toMatchObject({
			role: "assistant",
			stopReason: "error",
			errorMessage: "Claude runtime is not configured",
			content: [{ type: "text", text: "Claude runtime is not configured" }],
		});
	});

	it("translates Claude max-turn failures without claiming Superset set a cap", async () => {
		const appendMessageInputs: Array<unknown> = [];
		const runtimeLogs: Array<{
			message: string;
			meta?: Record<string, unknown>;
		}> = [];
		const provider: StandaloneChatProvider = {
			sendTurn: mock(async () => {
				throw new Error(
					"Claude Code returned an error result: Reached maximum number of turns (5)",
				);
			}),
		};
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({ appendMessageInputs }),
			provider,
			{
				error: (message, meta) => runtimeLogs.push({ message, meta }),
			},
		);

		await expect(
			manager.sendMessage({
				sessionId: SESSION_ID,
				payload: { content: "帮我清理内存并检查磁盘。" },
				metadata: { model: "gpt-5.5", permissionMode: "auto" },
			}),
		).rejects.toThrow("Superset standalone Chat does not set a turn cap");

		expect(appendMessageInputs.at(-1)).toMatchObject({
			role: "assistant",
			stopReason: "error",
			errorMessage: expect.stringContaining(
				"Superset standalone Chat does not set a turn cap",
			),
			content: [
				{
					type: "text",
					text: expect.stringContaining(
						"Superset standalone Chat does not set a turn cap",
					),
				},
			],
		});
		expect(runtimeLogs).toEqual([
			expect.objectContaining({
				message: "[standalone-chat] Claude turn failed",
				meta: expect.objectContaining({
					sessionId: SESSION_ID,
					model: "gpt-5.5",
					permissionMode: "auto",
					maxTurns: "unbounded",
					rawErrorMessage:
						"Claude Code returned an error result: Reached maximum number of turns (5)",
					normalizedErrorMessage: expect.stringContaining(
						"Superset standalone Chat does not set a turn cap",
					),
				}),
			}),
		]);
	});

	it("hydrates standalone history from persisted chat messages", async () => {
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({
				persistedMessages: [
					{
						id: "user-existing",
						role: "user",
						content: [{ type: "text", text: "之前的问题" }],
						createdAt: new Date("2026-06-11T08:00:00.000Z"),
					},
					{
						id: "assistant-existing",
						role: "assistant",
						content: [{ type: "text", text: "之前的回答" }],
						createdAt: new Date("2026-06-11T08:00:01.000Z"),
						stopReason: "end_turn",
					},
				],
			}),
		);

		await expect(manager.listMessages(SESSION_ID)).resolves.toEqual([
			{
				id: "user-existing",
				role: "user",
				content: [{ type: "text", text: "之前的问题" }],
				createdAt: new Date("2026-06-11T08:00:00.000Z"),
			},
			{
				id: "assistant-existing",
				role: "assistant",
				content: [{ type: "text", text: "之前的回答" }],
				createdAt: new Date("2026-06-11T08:00:01.000Z"),
				stopReason: "end_turn",
			},
		]);
	});

	it("returns cached history immediately while stale cloud history refreshes in the background", async () => {
		const cachedMessages: PersistedMessage[] = [
			{
				id: "user-cached",
				role: "user",
				content: [{ type: "text", text: "缓存里的问题" }],
				createdAt: new Date("2026-06-11T08:00:00.000Z"),
			},
		];
		const refreshedMessages: PersistedMessage[] = [
			...cachedMessages,
			{
				id: "assistant-refreshed",
				role: "assistant",
				content: [{ type: "text", text: "后台刷新的回答" }],
				createdAt: new Date("2026-06-11T08:00:01.000Z"),
				stopReason: "end_turn",
			},
		];
		let listMessagesCalls = 0;
		let resolveRefresh!: (messages: PersistedMessage[]) => void;
		const refreshPromise = new Promise<PersistedMessage[]>((resolve) => {
			resolveRefresh = resolve;
		});
		const manager = new StandaloneChatRuntimeManager(
			createApiClient({
				listMessagesQuery: async () => {
					listMessagesCalls += 1;
					return listMessagesCalls === 1 ? cachedMessages : refreshPromise;
				},
			}),
		);

		await expect(manager.listMessages(SESSION_ID)).resolves.toEqual([
			{
				id: "user-cached",
				role: "user",
				content: [{ type: "text", text: "缓存里的问题" }],
				createdAt: new Date("2026-06-11T08:00:00.000Z"),
			},
		]);
		const session = (
			manager as unknown as {
				sessions: Map<string, { lastHydratedAt: number }>;
			}
		).sessions.get(SESSION_ID);
		if (session) session.lastHydratedAt = 0;

		await expect(manager.listMessages(SESSION_ID)).resolves.toEqual([
			{
				id: "user-cached",
				role: "user",
				content: [{ type: "text", text: "缓存里的问题" }],
				createdAt: new Date("2026-06-11T08:00:00.000Z"),
			},
		]);
		expect(listMessagesCalls).toBe(2);

		resolveRefresh(refreshedMessages);
		await refreshPromise;
		await new Promise((resolve) => setTimeout(resolve, 0));

		await expect(manager.listMessages(SESSION_ID)).resolves.toEqual([
			{
				id: "user-cached",
				role: "user",
				content: [{ type: "text", text: "缓存里的问题" }],
				createdAt: new Date("2026-06-11T08:00:00.000Z"),
			},
			{
				id: "assistant-refreshed",
				role: "assistant",
				content: [{ type: "text", text: "后台刷新的回答" }],
				createdAt: new Date("2026-06-11T08:00:01.000Z"),
				stopReason: "end_turn",
			},
		]);
	});
});
