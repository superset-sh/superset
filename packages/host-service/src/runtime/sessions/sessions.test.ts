import { afterEach, describe, expect, test } from "bun:test";
import type {
	PermissionMode,
	Query,
	SDKControlInitializeResponse,
	SDKMessage,
	SDKUserMessage,
	SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	SessionEventEnvelope,
	SessionPermissionResult,
} from "@superset/session-protocol";
import {
	type ClaudeQueryFactory,
	ClaudeSessionManager,
	SessionUnavailableError,
	SessionWorkspaceMismatchError,
} from "./sessions";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const CLAUDE_SESSION_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_WORKSPACE_ID = "00000000-0000-4000-8000-000000000004";
const NEXT_CLAUDE_SESSION_ID = "00000000-0000-4000-8000-000000000005";
const CWD = `/tmp/${WORKSPACE_ID}`;
const CLAUDE_EXECUTABLE = "/opt/claude/bin/claude";
const USER_SHELL_ENVIRONMENT = {
	HOME: "/home/test-user",
	PATH: "/opt/claude/bin:/usr/bin",
	ANTHROPIC_API_KEY: "user-shell-api-key",
	ANTHROPIC_AUTH_TOKEN: "user-shell-auth-token",
};

const INITIALIZATION: SDKControlInitializeResponse = {
	commands: [
		{
			name: "compact",
			description: "Compact the conversation",
			argumentHint: "",
		},
	],
	agents: [{ name: "Explore", description: "Inspect the repository" }],
	output_style: "default",
	available_output_styles: ["default"],
	models: [
		{
			value: "sonnet",
			displayName: "Sonnet",
			description: "Balanced model",
			supportsEffort: true,
			supportedEffortLevels: ["low", "high"],
		},
	],
	account: { email: "test@example.com", subscriptionType: "team" },
};

interface PendingRead {
	resolve: (result: IteratorResult<SDKMessage, void>) => void;
	reject: (reason: unknown) => void;
}

/** Minimal controllable AsyncGenerator plus the Query methods manager calls. */
class FakeQuery {
	private readonly buffered: SDKMessage[] = [];
	private pending: PendingRead | null = null;
	private failure: unknown = null;
	closed = false;
	interruptCalls = 0;
	readonly modelCalls: Array<string | undefined> = [];
	readonly permissionModeCalls: PermissionMode[] = [];

	constructor(
		private readonly initialization: SDKControlInitializeResponse = INITIALIZATION,
		private readonly initializationError?: unknown,
	) {}

	asQuery(): Query {
		return this as unknown as Query;
	}

	[Symbol.asyncIterator](): AsyncIterator<SDKMessage, void> {
		return this;
	}

	next(): Promise<IteratorResult<SDKMessage, void>> {
		if (this.failure !== null) return Promise.reject(this.failure);
		const message = this.buffered.shift();
		if (message) return Promise.resolve({ done: false, value: message });
		if (this.closed) return Promise.resolve({ done: true, value: undefined });
		return new Promise((resolve, reject) => {
			this.pending = { resolve, reject };
		});
	}

	emit(message: SDKMessage): void {
		if (this.closed || this.failure !== null) {
			throw new Error("cannot emit after fake query termination");
		}
		const pending = this.pending;
		this.pending = null;
		if (pending) {
			pending.resolve({ done: false, value: message });
			return;
		}
		this.buffered.push(message);
	}

	fail(error: unknown): void {
		if (this.closed || this.failure !== null) return;
		this.failure = error;
		const pending = this.pending;
		this.pending = null;
		pending?.reject(error);
	}

	initializationResult(): Promise<SDKControlInitializeResponse> {
		if (this.initializationError !== undefined) {
			return Promise.reject(this.initializationError);
		}
		return Promise.resolve(structuredClone(this.initialization));
	}

	interrupt(): Promise<void> {
		this.interruptCalls += 1;
		return Promise.resolve();
	}

	setModel(model?: string): Promise<void> {
		this.modelCalls.push(model);
		return Promise.resolve();
	}

	setPermissionMode(mode: PermissionMode): Promise<void> {
		this.permissionModeCalls.push(mode);
		return Promise.resolve();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		const pending = this.pending;
		this.pending = null;
		pending?.resolve({ done: true, value: undefined });
	}
}

type QueryFactoryInput = Parameters<ClaudeQueryFactory>[0];

interface TranscriptRead {
	sessionId: string;
	options:
		| {
				dir?: string;
				includeSystemMessages?: boolean;
				limit?: number;
				offset?: number;
		  }
		| undefined;
}

interface ManagerHarness {
	manager: ClaudeSessionManager;
	queries: FakeQuery[];
	factoryInputs: QueryFactoryInput[];
	transcriptReads: TranscriptRead[];
}

const managers: ClaudeSessionManager[] = [];

function createHarness(
	transcript: SessionMessage[] = [],
	runtimeOptions: {
		baseEnvironment?: Record<string, string>;
		claudeExecutable?: string;
		createNativeSessionIds?: string[];
		initializationErrors?: unknown[];
	} = {},
): ManagerHarness {
	const queries: FakeQuery[] = [];
	const factoryInputs: QueryFactoryInput[] = [];
	const transcriptReads: TranscriptRead[] = [];
	const manager = new ClaudeSessionManager({
		resolveWorkspaceCwd: (workspaceId) => `/tmp/${workspaceId}`,
		getClaudeBaseEnvironment: () => ({
			...(runtimeOptions.baseEnvironment ?? USER_SHELL_ENVIRONMENT),
		}),
		resolveClaudeExecutable: () =>
			runtimeOptions.claudeExecutable ?? CLAUDE_EXECUTABLE,
		createNativeSessionId: runtimeOptions.createNativeSessionIds
			? () => {
					const sessionId = runtimeOptions.createNativeSessionIds?.shift();
					if (!sessionId) throw new Error("missing fake native session id");
					return sessionId;
				}
			: undefined,
		queryFactory: (input) => {
			factoryInputs.push(input);
			const query = new FakeQuery(
				INITIALIZATION,
				runtimeOptions.initializationErrors?.[queries.length],
			);
			queries.push(query);
			return query.asQuery();
		},
		getSessionMessages: (sessionId, options) => {
			transcriptReads.push({ sessionId, options });
			return Promise.resolve(structuredClone(transcript));
		},
	});
	managers.push(manager);
	return { manager, queries, factoryInputs, transcriptReads };
}

afterEach(async () => {
	await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
});

async function waitFor(
	predicate: () => boolean,
	label: string,
	timeoutMs = 1_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline)
			throw new Error(`timed out waiting for ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

function initMessage(overrides?: {
	sessionId?: string;
	model?: string;
	permissionMode?: PermissionMode;
}): SDKMessage {
	return {
		type: "system",
		subtype: "init",
		apiKeySource: "oauth",
		claude_code_version: "test",
		cwd: CWD,
		tools: ["Read", "Bash"],
		mcp_servers: [],
		model: overrides?.model ?? "claude-sonnet-test",
		permissionMode: overrides?.permissionMode ?? "default",
		slash_commands: ["compact"],
		output_style: "default",
		skills: [],
		plugins: [],
		uuid: "init-message",
		session_id: overrides?.sessionId ?? CLAUDE_SESSION_ID,
	};
}

function stateMessage(
	state: "idle" | "running" | "requires_action",
): SDKMessage {
	return {
		type: "system",
		subtype: "session_state_changed",
		state,
		uuid: `state-${state}`,
		session_id: CLAUDE_SESSION_ID,
	};
}

function resultMessage(sessionId = CLAUDE_SESSION_ID): SDKMessage {
	return {
		type: "result",
		subtype: "success",
		duration_ms: 1,
		duration_api_ms: 1,
		is_error: false,
		num_turns: 1,
		result: "ok",
		stop_reason: null,
		total_cost_usd: 0,
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
			service_tier: "standard",
		},
		modelUsage: {},
		permission_denials: [],
		uuid: "result-message",
		session_id: sessionId,
	};
}

function userMessage(text: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content: text },
		parent_tool_use_id: null,
	};
}

function transcriptMessage(index: number): SessionMessage {
	return {
		type: index % 2 === 0 ? "user" : "assistant",
		uuid: `transcript-${index}`,
		session_id: CLAUDE_SESSION_ID,
		message: { index },
		parent_tool_use_id: null,
		parent_agent_id: null,
	};
}

function replayAll(
	manager: ClaudeSessionManager,
	since = 0,
): SessionEventEnvelope[] {
	const envelopes: SessionEventEnvelope[] = [];
	const unsubscribe = manager.subscribe({
		sessionId: SESSION_ID,
		since,
		onEnvelope: (envelope) => envelopes.push(envelope),
	});
	unsubscribe();
	return envelopes;
}

describe("ClaudeSessionManager", () => {
	test("a fresh manager starts a fresh native session", async () => {
		const first = createHarness([], {
			createNativeSessionIds: [CLAUDE_SESSION_ID],
		});
		await first.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			model: "sonnet",
			permissionMode: "plan",
			effort: "high",
			title: "Live session",
		});
		await first.manager.dispose();

		const second = createHarness([], {
			createNativeSessionIds: [NEXT_CLAUDE_SESSION_ID],
		});
		const recreated = await second.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});

		expect(recreated).toMatchObject({
			sessionId: SESSION_ID,
			claudeSessionId: NEXT_CLAUDE_SESSION_ID,
			workspaceId: WORKSPACE_ID,
			model: null,
			permissionMode: "default",
			effort: null,
			status: "idle",
		});
		expect(second.factoryInputs[0]?.options).toMatchObject({
			cwd: CWD,
			sessionId: NEXT_CLAUDE_SESSION_ID,
			permissionMode: "default",
		});
		expect(second.factoryInputs[0]?.options?.resume).toBeUndefined();
		expect(second.factoryInputs[0]?.options?.title).toBeUndefined();
	});

	test("creates with SDK options, captures init state, and exposes the catalog", async () => {
		const harness = createHarness();
		const created = await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			model: "sonnet",
			permissionMode: "plan",
			effort: "high",
			title: "Test session",
		});

		expect(created).toMatchObject({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			cwd: CWD,
			status: "idle",
			model: "sonnet",
			permissionMode: "plan",
			effort: "high",
			lastSeq: 1,
		});
		expect(created.claudeSessionId).not.toBe(SESSION_ID);
		expect(created.claudeSessionId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		const factoryInput = harness.factoryInputs[0];
		expect(typeof factoryInput?.prompt).not.toBe("string");
		expect(factoryInput?.options).toMatchObject({
			cwd: CWD,
			pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
			sessionId: created.claudeSessionId,
			model: "sonnet",
			effort: "high",
			title: "Test session",
			permissionMode: "plan",
			includePartialMessages: true,
			persistSession: true,
		});
		expect(factoryInput?.options?.env).toMatchObject({
			CLAUDE_AGENT_SDK_CLIENT_APP: "superset-host",
			ANTHROPIC_API_KEY: "user-shell-api-key",
			ANTHROPIC_AUTH_TOKEN: "user-shell-auth-token",
		});
		expect(harness.manager.getCatalog({ sessionId: SESSION_ID })).toEqual({
			models: INITIALIZATION.models,
			commands: INITIALIZATION.commands,
			agents: INITIALIZATION.agents,
			permissionModes: ["default", "acceptEdits", "plan", "dontAsk", "auto"],
		});

		harness.queries[0]?.emit(
			initMessage({
				sessionId: CLAUDE_SESSION_ID,
				model: "claude-opus-test",
				permissionMode: "default",
			}),
		);
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).claudeSessionId ===
				CLAUDE_SESSION_ID,
			"init state",
		);
		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			claudeSessionId: CLAUDE_SESSION_ID,
			model: "claude-opus-test",
			permissionMode: "default",
			lastSeq: 3,
		});
		expect(replayAll(harness.manager).map(({ frame }) => frame.kind)).toEqual([
			"state",
			"sdk",
			"state",
		]);
	});

	test("uses only the injected preserved snapshot, never the live process environment", async () => {
		const processOnlyKey = "SUPERSET_CLAUDE_TEST_ROOT_DOTENV_ONLY";
		const previous = process.env[processOnlyKey];
		process.env[processOnlyKey] = "must-not-leak";
		try {
			const harness = createHarness([], {
				baseEnvironment: {
					HOME: "/home/test-user",
					PATH: "/usr/bin",
					ANTHROPIC_API_KEY: "preserved-user-key",
				},
				claudeExecutable: "/usr/bin/claude",
			});
			await harness.manager.create({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
			});

			expect(harness.factoryInputs[0]?.options).toMatchObject({
				pathToClaudeCodeExecutable: "/usr/bin/claude",
				env: {
					ANTHROPIC_API_KEY: "preserved-user-key",
					CLAUDE_AGENT_SDK_CLIENT_APP: "superset-host",
				},
			});
			expect(
				harness.factoryInputs[0]?.options?.env?.[processOnlyKey],
			).toBeUndefined();
		} finally {
			if (previous === undefined) delete process.env[processOnlyKey];
			else process.env[processOnlyKey] = previous;
		}
	});

	test("keeps dangerous SDK permission state raw without exposing it as controllable state", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});

		harness.queries[0]?.emit(
			initMessage({ permissionMode: "bypassPermissions" }),
		);
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).lastSeq === 3,
			"unsafe raw SDK init",
		);

		expect(harness.manager.get({ sessionId: SESSION_ID }).permissionMode).toBe(
			"default",
		);
		const sdkFrame = replayAll(harness.manager).find(
			({ frame }) => frame.kind === "sdk",
		);
		expect(sdkFrame?.frame).toMatchObject({
			kind: "sdk",
			message: { permissionMode: "bypassPermissions" },
		});
	});

	test("admits input immediately and journals SDK messages plus state transitions", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const prompt = harness.factoryInputs[0]?.prompt;
		if (!prompt || typeof prompt === "string")
			throw new Error("missing input stream");
		const nextInput = prompt[Symbol.asyncIterator]().next();
		const message = userMessage("hello");

		expect(
			harness.manager.sendMessage({ sessionId: SESSION_ID, message }),
		).toEqual({ accepted: true });
		expect(await nextInput).toEqual({ done: false, value: message });
		expect(harness.manager.get({ sessionId: SESSION_ID }).status).toBe(
			"running",
		);

		harness.queries[0]?.emit(stateMessage("idle"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "idle",
			"idle SDK state",
		);
		const envelopes = replayAll(harness.manager);
		expect(envelopes.map(({ frame }) => frame.kind)).toEqual([
			"state",
			"state",
			"sdk",
			"state",
		]);
		expect(envelopes[2]?.frame).toEqual({
			kind: "sdk",
			message: stateMessage("idle"),
		});
		expect(harness.manager.get({ sessionId: SESSION_ID }).lastSeq).toBe(4);
	});

	test("admits only one input per idle turn", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const prompt = harness.factoryInputs[0]?.prompt;
		if (!prompt || typeof prompt === "string") {
			throw new Error("missing input stream");
		}
		const iterator = prompt[Symbol.asyncIterator]();
		const first = userMessage("first");

		expect(
			harness.manager.sendMessage({ sessionId: SESSION_ID, message: first }),
		).toEqual({ accepted: true });
		expect(() =>
			harness.manager.sendMessage({
				sessionId: SESSION_ID,
				message: userMessage("duplicate"),
			}),
		).toThrow(SessionUnavailableError);
		expect(await iterator.next()).toEqual({ done: false, value: first });

		harness.queries[0]?.emit(stateMessage("idle"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "idle",
			"next idle turn",
		);
		expect(
			harness.manager.sendMessage({
				sessionId: SESSION_ID,
				message: userMessage("next turn"),
			}),
		).toEqual({ accepted: true });
	});

	test("treats a result as authoritative turn completion without a trailing idle frame", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.manager.sendMessage({
			sessionId: SESSION_ID,
			message: userMessage("first turn"),
		});

		harness.queries[0]?.emit(resultMessage());
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "idle",
			"result-derived idle state",
		);
		expect(
			harness.manager.sendMessage({
				sessionId: SESSION_ID,
				message: userMessage("second turn"),
			}),
		).toEqual({ accepted: true });
		expect(replayAll(harness.manager).map(({ frame }) => frame.kind)).toEqual([
			"state",
			"state",
			"sdk",
			"state",
			"state",
		]);
	});

	test("detaches a throwing subscriber without harming the query or later subscribers", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const since = harness.manager.get({ sessionId: SESSION_ID }).lastSeq;
		let failedSubscriberCalls = 0;
		harness.manager.subscribe({
			sessionId: SESSION_ID,
			since,
			onEnvelope: () => {
				failedSubscriberCalls += 1;
				throw new Error("socket send failed");
			},
		});
		const healthySubscriberFrames: SessionEventEnvelope[] = [];
		const unsubscribeHealthy = harness.manager.subscribe({
			sessionId: SESSION_ID,
			since,
			onEnvelope: (envelope) => healthySubscriberFrames.push(envelope),
		});

		harness.queries[0]?.emit(stateMessage("idle"));
		await waitFor(
			() => healthySubscriberFrames.length === 2,
			"healthy subscriber delivery",
		);
		harness.queries[0]?.emit(stateMessage("running"));
		await waitFor(
			() => healthySubscriberFrames.length === 4,
			"continued healthy subscriber delivery",
		);
		unsubscribeHealthy();

		expect(failedSubscriberCalls).toBe(1);
		expect(healthySubscriberFrames.map(({ frame }) => frame.kind)).toEqual([
			"sdk",
			"state",
			"sdk",
			"state",
		]);
		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			status: "running",
			lastError: null,
		});
		expect(harness.queries[0]?.closed).toBe(false);
	});

	test("paginates the native transcript newest-first with opaque cursors", async () => {
		const transcript = Array.from({ length: 5 }, (_, index) =>
			transcriptMessage(index),
		);
		const harness = createHarness(transcript);
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.queries[0]?.emit(initMessage());
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).claudeSessionId ===
				CLAUDE_SESSION_ID,
			"native session id",
		);

		const newest = await harness.manager.getMessages({
			sessionId: SESSION_ID,
			limit: 2,
		});
		expect(newest.items.map(({ uuid }) => uuid)).toEqual([
			"transcript-3",
			"transcript-4",
		]);
		expect(newest.nextCursor).not.toBeNull();
		const middle = await harness.manager.getMessages({
			sessionId: SESSION_ID,
			cursor: newest.nextCursor ?? undefined,
			limit: 2,
		});
		expect(middle.items.map(({ uuid }) => uuid)).toEqual([
			"transcript-1",
			"transcript-2",
		]);
		const oldest = await harness.manager.getMessages({
			sessionId: SESSION_ID,
			cursor: middle.nextCursor ?? undefined,
			limit: 2,
		});
		expect(oldest.items.map(({ uuid }) => uuid)).toEqual(["transcript-0"]);
		expect(oldest.nextCursor).toBeNull();
		expect(harness.transcriptReads[0]).toEqual({
			sessionId: CLAUDE_SESSION_ID,
			options: { dir: CWD, includeSystemMessages: true },
		});
	});

	test("resolves a permission exactly once and returns the winning response", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.manager.sendMessage({
			sessionId: SESSION_ID,
			message: userMessage("run pwd"),
		});
		const canUseTool = harness.factoryInputs[0]?.options?.canUseTool;
		if (!canUseTool) throw new Error("canUseTool was not configured");
		const controller = new AbortController();
		const sdkResponse = canUseTool(
			"Bash",
			{ command: "pwd" },
			{
				requestId: "permission-1",
				toolUseID: "tool-1",
				title: "Run pwd?",
				suggestions: [
					{
						type: "setMode",
						mode: "bypassPermissions",
						destination: "session",
					},
					{
						type: "addRules",
						rules: [{ toolName: "Bash", ruleContent: "pwd" }],
						behavior: "allow",
						destination: "session",
					},
				],
				signal: controller.signal,
			},
		);
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).status ===
				"requires_action",
			"pending permission",
		);
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingPermissions[0]
				?.suggestions,
		).toEqual([
			{
				type: "addRules",
				rules: [{ toolName: "Bash", ruleContent: "pwd" }],
				behavior: "allow",
				destination: "session",
			},
		]);

		const winner: SessionPermissionResult = {
			behavior: "allow",
			updatedInput: { command: "pwd -P" },
		};
		expect(
			harness.manager.respondToPermission({
				sessionId: SESSION_ID,
				requestId: "permission-1",
				response: winner,
			}),
		).toEqual({ status: "resolved" });
		expect(
			harness.manager.respondToPermission({
				sessionId: SESSION_ID,
				requestId: "permission-1",
				response: { behavior: "deny", message: "too late" },
			}),
		).toEqual({ status: "already_resolved" });
		expect(await sdkResponse).toEqual(winner);
		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			status: "running",
			pendingPermissions: [],
		});
		expect(replayAll(harness.manager).map(({ frame }) => frame.kind)).toContain(
			"permission_resolved",
		);
	});

	test("resolves a user-dialog callback exactly once", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.manager.sendMessage({
			sessionId: SESSION_ID,
			message: userMessage("show dialog"),
		});
		const onUserDialog = harness.factoryInputs[0]?.options?.onUserDialog;
		if (!onUserDialog) throw new Error("onUserDialog was not configured");
		const sdkResponse = onUserDialog(
			{ dialogKind: "test_dialog", payload: { prompt: "Continue?" } },
			{ signal: new AbortController().signal },
		);
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).pendingUserDialogs
					.length === 1,
			"pending user dialog",
		);
		const requestId = harness.manager.get({ sessionId: SESSION_ID })
			.pendingUserDialogs[0]?.requestId;
		if (!requestId) throw new Error("missing pending user-dialog id");
		const winner = {
			behavior: "completed",
			result: { confirmed: true },
		} as const;

		expect(
			harness.manager.respondToUserDialog({
				sessionId: SESSION_ID,
				requestId,
				response: winner,
			}),
		).toEqual({ status: "resolved" });
		expect(
			harness.manager.respondToUserDialog({
				sessionId: SESSION_ID,
				requestId,
				response: { behavior: "cancelled" },
			}),
		).toEqual({ status: "already_resolved" });
		expect(await sdkResponse).toEqual(winner);
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingUserDialogs,
		).toEqual([]);
	});

	test("deduplicates active MCP elicitation ids and resolves the callback exactly once", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.manager.sendMessage({
			sessionId: SESSION_ID,
			message: userMessage("ask MCP"),
		});
		const onElicitation = harness.factoryInputs[0]?.options?.onElicitation;
		if (!onElicitation) throw new Error("onElicitation was not configured");
		const request = {
			serverName: "test-mcp",
			message: "Choose a value",
			mode: "form" as const,
			elicitationId: "elicitation-1",
			requestedSchema: { type: "object" },
		};
		const first = onElicitation(request, {
			signal: new AbortController().signal,
		});
		const duplicate = onElicitation(request, {
			signal: new AbortController().signal,
		});
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).pendingElicitations
					.length === 1,
			"deduplicated elicitation",
		);
		expect(
			replayAll(harness.manager).filter(
				({ frame }) => frame.kind === "elicitation_requested",
			),
		).toHaveLength(1);
		const winner = { action: "accept", content: { choice: "alpha" } } as const;

		expect(
			harness.manager.respondToElicitation({
				sessionId: SESSION_ID,
				requestId: request.elicitationId,
				response: winner,
			}),
		).toEqual({ status: "resolved" });
		expect(
			harness.manager.respondToElicitation({
				sessionId: SESSION_ID,
				requestId: request.elicitationId,
				response: { action: "decline" },
			}),
		).toEqual({ status: "already_resolved" });
		expect(await first).toEqual(winner);
		expect(await duplicate).toEqual(winner);
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingElicitations,
		).toEqual([]);
	});

	test("settles a permission callback whose signal was already aborted", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const canUseTool = harness.factoryInputs[0]?.options?.canUseTool;
		if (!canUseTool) throw new Error("canUseTool was not configured");
		const controller = new AbortController();
		controller.abort();

		expect(
			await canUseTool(
				"Bash",
				{ command: "pwd" },
				{
					requestId: "permission-aborted",
					toolUseID: "tool-aborted",
					signal: controller.signal,
				},
			),
		).toEqual({
			behavior: "deny",
			message: "Permission request was cancelled",
		});
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingPermissions,
		).toEqual([]);
	});

	test("settles a user-dialog callback whose signal was already aborted", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const onUserDialog = harness.factoryInputs[0]?.options?.onUserDialog;
		if (!onUserDialog) throw new Error("onUserDialog was not configured");
		const controller = new AbortController();
		controller.abort();

		expect(
			await onUserDialog(
				{ dialogKind: "test_dialog", payload: { prompt: "Continue?" } },
				{ signal: controller.signal },
			),
		).toEqual({ behavior: "cancelled" });
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingUserDialogs,
		).toEqual([]);
	});

	test("settles an elicitation callback whose signal was already aborted", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const onElicitation = harness.factoryInputs[0]?.options?.onElicitation;
		if (!onElicitation) throw new Error("onElicitation was not configured");
		const controller = new AbortController();
		controller.abort();

		expect(
			await onElicitation(
				{
					serverName: "test-mcp",
					message: "Choose a value",
					mode: "form",
					requestedSchema: { type: "object" },
				},
				{ signal: controller.signal },
			),
		).toEqual({ action: "cancel" });
		expect(
			harness.manager.get({ sessionId: SESSION_ID }).pendingElicitations,
		).toEqual([]);
	});

	test("forwards model and permission-mode controls and broadcasts state", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		await harness.manager.setModel({ sessionId: SESSION_ID, model: "opus" });
		await harness.manager.setPermissionMode({
			sessionId: SESSION_ID,
			permissionMode: "plan",
		});
		await harness.manager.setModel({ sessionId: SESSION_ID });

		expect(harness.queries[0]?.modelCalls).toEqual(["opus", undefined]);
		expect(harness.queries[0]?.permissionModeCalls).toEqual(["plan"]);
		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			model: null,
			permissionMode: "plan",
			lastSeq: 4,
		});
		expect(replayAll(harness.manager).map(({ frame }) => frame.kind)).toEqual([
			"state",
			"state",
			"state",
			"state",
		]);
	});

	test("a future stream cursor receives one terminal reset at the current tail", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const envelopes = replayAll(harness.manager, 999);
		expect(envelopes).toHaveLength(1);
		expect(envelopes[0]).toMatchObject({
			seq: 0,
			sessionId: SESSION_ID,
			frame: {
				kind: "reset",
				reason: "cursor_unavailable",
				latestSeq: 1,
			},
		});

		await harness.manager.setModel({ sessionId: SESSION_ID, model: "opus" });
		expect(envelopes).toHaveLength(1);
	});

	test("rejects reusing a session id for a different workspace", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		expect(
			harness.manager.create({
				sessionId: SESSION_ID,
				workspaceId: OTHER_WORKSPACE_ID,
			}),
		).rejects.toBeInstanceOf(SessionWorkspaceMismatchError);
	});

	test("retries only explicitly, replaces the failed attempt, and resets old subscribers", async () => {
		const harness = createHarness();
		const created = await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			model: "sonnet",
			permissionMode: "default",
			effort: "high",
			title: "Retry test",
		});
		await harness.manager.setModel({
			sessionId: SESSION_ID,
			model: "opus",
		});
		await harness.manager.setPermissionMode({
			sessionId: SESSION_ID,
			permissionMode: "plan",
		});
		const oldNativeSessionId = created.claudeSessionId;
		const oldAttemptFrames: SessionEventEnvelope[] = [];
		const unsubscribeOld = harness.manager.subscribe({
			sessionId: SESSION_ID,
			since: harness.manager.get({ sessionId: SESSION_ID }).lastSeq,
			onEnvelope: (envelope) => oldAttemptFrames.push(envelope),
		});

		harness.queries[0]?.fail(new Error("first attempt failed"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "errored",
			"first attempt error",
		);
		const failedState = harness.manager.get({ sessionId: SESSION_ID });

		// Create is intentionally idempotent even for an errored tombstone. It
		// must never become an implicit retry path.
		expect(
			await harness.manager.create({
				sessionId: SESSION_ID,
				workspaceId: WORKSPACE_ID,
				model: "haiku",
			}),
		).toEqual(failedState);
		expect(harness.queries).toHaveLength(1);

		const firstRetry = harness.manager.retry({ sessionId: SESSION_ID });
		const concurrentRetry = harness.manager.retry({ sessionId: SESSION_ID });
		const [retried, coalesced] = await Promise.all([
			firstRetry,
			concurrentRetry,
		]);
		unsubscribeOld();

		expect(retried).toEqual(coalesced);
		expect(retried).toMatchObject({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			status: "idle",
			model: "opus",
			permissionMode: "plan",
			effort: "high",
			createdAt: created.createdAt,
			lastError: null,
		});
		expect(retried.claudeSessionId).not.toBe(oldNativeSessionId);
		expect(retried.claudeSessionId).not.toBe(SESSION_ID);
		if (!retried.claudeSessionId) {
			throw new Error("Expected retry to allocate a Claude-native session ID");
		}
		expect(harness.queries).toHaveLength(2);
		expect(harness.queries[0]?.closed).toBe(true);
		expect(harness.factoryInputs[1]?.options).toMatchObject({
			sessionId: retried.claudeSessionId,
			model: "opus",
			permissionMode: "plan",
			effort: "high",
			title: "Retry test",
		});
		await harness.manager.getMessages({ sessionId: SESSION_ID, limit: 50 });
		expect(harness.transcriptReads.at(-1)?.sessionId).toBe(
			retried.claudeSessionId,
		);
		expect(oldAttemptFrames.at(-1)).toMatchObject({
			seq: 0,
			sessionId: SESSION_ID,
			frame: {
				kind: "reset",
				reason: "session_restarted",
				latestSeq: 1,
			},
		});
		expect(harness.manager.list({ limit: 50 }).items).toHaveLength(1);
		expect(replayAll(harness.manager).map(({ frame }) => frame.kind)).toEqual([
			"state",
			"state",
		]);
	});

	test("rejects retry for a live session", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});

		expect(
			harness.manager.retry({ sessionId: SESSION_ID }),
		).rejects.toBeInstanceOf(SessionUnavailableError);
		expect(harness.queries).toHaveLength(1);
	});

	test("closes pending work and makes callbacks from a replaced attempt stale", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const oldOptions = harness.factoryInputs[0]?.options;
		const oldCanUseTool = oldOptions?.canUseTool;
		const oldUserDialog = oldOptions?.onUserDialog;
		const oldElicitation = oldOptions?.onElicitation;
		if (!oldCanUseTool || !oldUserDialog || !oldElicitation) {
			throw new Error("missing SDK callbacks");
		}
		const pendingPermission = oldCanUseTool(
			"Bash",
			{ command: "pwd" },
			{
				requestId: "pending-before-retry",
				toolUseID: "tool-before-retry",
				signal: new AbortController().signal,
			},
		);
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).pendingPermissions
					.length === 1,
			"pending callback before failure",
		);

		harness.queries[0]?.fail(new Error("replace me"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "errored",
			"replaceable error",
		);
		expect(await pendingPermission).toMatchObject({
			behavior: "deny",
			message: "replace me",
		});
		await harness.manager.retry({ sessionId: SESSION_ID });

		expect(
			await oldCanUseTool(
				"Bash",
				{ command: "echo stale" },
				{
					requestId: "stale-permission",
					toolUseID: "stale-tool",
					signal: new AbortController().signal,
				},
			),
		).toMatchObject({
			behavior: "deny",
			message: "Session is no longer available",
			interrupt: true,
		});
		expect(
			await oldUserDialog(
				{ dialogKind: "test_dialog", payload: { prompt: "stale" } },
				{ signal: new AbortController().signal },
			),
		).toEqual({ behavior: "cancelled" });
		expect(
			await oldElicitation(
				{
					serverName: "stale-mcp",
					message: "stale",
					mode: "form",
				},
				{ signal: new AbortController().signal },
			),
		).toEqual({ action: "cancel" });
		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			status: "idle",
			pendingPermissions: [],
			pendingUserDialogs: [],
			pendingElicitations: [],
		});
	});

	test("coalesces a failing retry and leaves the replacement tombstone inspectable", async () => {
		const harness = createHarness([], {
			initializationErrors: [
				undefined,
				new Error("retry initialization failed"),
			],
		});
		const created = await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.queries[0]?.fail(new Error("initial attempt failed"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "errored",
			"initial failure",
		);

		const outcomes = await Promise.allSettled([
			harness.manager.retry({ sessionId: SESSION_ID }),
			harness.manager.retry({ sessionId: SESSION_ID }),
		]);
		expect(outcomes.map(({ status }) => status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(harness.queries).toHaveLength(2);
		expect(harness.queries[0]?.closed).toBe(true);
		expect(harness.queries[1]?.closed).toBe(true);
		const replacement = harness.manager.get({ sessionId: SESSION_ID });
		expect(replacement).toMatchObject({
			status: "errored",
			lastError: "retry initialization failed",
		});
		expect(replacement.claudeSessionId).not.toBe(created.claudeSessionId);
		expect(harness.manager.list({ limit: 50 }).items).toEqual([]);

		// The failed replacement, not the retired attempt, is now the explicit
		// recovery target. A subsequent retry gets another fresh transcript.
		const recovered = await harness.manager.retry({ sessionId: SESSION_ID });
		expect(recovered.status).toBe("idle");
		expect(recovered.claudeSessionId).not.toBe(replacement.claudeSessionId);
		expect(harness.queries).toHaveLength(3);
	});

	test("marks a failed query errored and excludes it from live-session lists", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		expect(harness.manager.list({ limit: 50 }).items).toHaveLength(1);
		harness.queries[0]?.fail(new Error("query transport failed"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "errored",
			"errored state",
		);

		expect(harness.manager.get({ sessionId: SESSION_ID })).toMatchObject({
			status: "errored",
			lastError: "query transport failed",
		});
		expect(harness.manager.list({ limit: 50 }).items).toEqual([]);
		expect(() =>
			harness.manager.sendMessage({
				sessionId: SESSION_ID,
				message: userMessage("after failure"),
			}),
		).toThrow(SessionUnavailableError);
	});

	test("publishes errored before cancelling pending callbacks", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		harness.manager.sendMessage({
			sessionId: SESSION_ID,
			message: userMessage("run pwd"),
		});
		const canUseTool = harness.factoryInputs[0]?.options?.canUseTool;
		if (!canUseTool) throw new Error("canUseTool was not configured");
		const sdkResponse = canUseTool(
			"Bash",
			{ command: "pwd" },
			{
				requestId: "permission-error",
				toolUseID: "tool-error",
				signal: new AbortController().signal,
			},
		);
		await waitFor(
			() =>
				harness.manager.get({ sessionId: SESSION_ID }).status ===
				"requires_action",
			"pending permission",
		);
		const live: SessionEventEnvelope[] = [];
		const unsubscribe = harness.manager.subscribe({
			sessionId: SESSION_ID,
			since: harness.manager.get({ sessionId: SESSION_ID }).lastSeq,
			onEnvelope: (envelope) => live.push(envelope),
		});

		harness.queries[0]?.fail(new Error("query transport failed"));
		await waitFor(
			() => harness.manager.get({ sessionId: SESSION_ID }).status === "errored",
			"errored state",
		);
		unsubscribe();
		expect(await sdkResponse).toMatchObject({
			behavior: "deny",
			message: "query transport failed",
		});
		const terminalStatuses = live.flatMap(({ frame }) =>
			frame.kind === "state" ? [frame.state.status] : [],
		);
		expect(terminalStatuses.length).toBeGreaterThan(0);
		expect(terminalStatuses.every((status) => status === "errored")).toBe(true);
	});

	test("dispose closes the query and input and publishes exited state", async () => {
		const harness = createHarness();
		await harness.manager.create({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
		});
		const live: SessionEventEnvelope[] = [];
		const unsubscribe = harness.manager.subscribe({
			sessionId: SESSION_ID,
			since: harness.manager.get({ sessionId: SESSION_ID }).lastSeq,
			onEnvelope: (envelope) => live.push(envelope),
		});

		await harness.manager.dispose();
		unsubscribe();
		expect(harness.queries[0]?.closed).toBe(true);
		expect(harness.manager.get({ sessionId: SESSION_ID }).status).toBe(
			"exited",
		);
		expect(harness.manager.list({ limit: 50 }).items).toEqual([]);
		expect(live.at(-1)?.frame).toMatchObject({
			kind: "state",
			state: { status: "exited" },
		});

		const prompt = harness.factoryInputs[0]?.prompt;
		if (!prompt || typeof prompt === "string")
			throw new Error("missing input stream");
		expect(await prompt[Symbol.asyncIterator]().next()).toEqual({
			done: true,
			value: undefined,
		});
	});
});
