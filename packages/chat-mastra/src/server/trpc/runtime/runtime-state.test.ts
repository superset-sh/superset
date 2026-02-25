import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";
const workspaceA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

interface MockHarnessEvent {
	type: string;
	[key: string]: unknown;
}

interface MockHarness {
	resourceId: string | null;
	currentThreadId: string | null;
	aborts: number;
	sendMessageCalls: Array<{ content: string }>;
	switchModelCalls: Array<{ modelId: string; scope?: string }>;
	toolApprovalCalls: Array<{ decision: string }>;
	questionCalls: Array<{ questionId: string; answer: string }>;
	planCalls: Array<{
		planId: string;
		response: { action: string; feedback?: string };
	}>;
	init: () => Promise<void>;
	setResourceId: ({ resourceId }: { resourceId: string }) => void;
	selectOrCreateThread: () => Promise<{ id: string }>;
	switchModel: ({
		modelId,
		scope,
	}: {
		modelId: string;
		scope?: "global" | "thread";
	}) => Promise<void>;
	sendMessage: ({ content }: { content: string }) => Promise<void>;
	abort: () => void;
	respondToToolApproval: ({ decision }: { decision: string }) => void;
	respondToQuestion: ({
		questionId,
		answer,
	}: {
		questionId: string;
		answer: string;
	}) => void;
	respondToPlanApproval: ({
		planId,
		response,
	}: {
		planId: string;
		response: { action: string; feedback?: string };
	}) => Promise<void>;
	getDisplayState: () => {
		isRunning: boolean;
		tokenUsage: {
			promptTokens: number;
			completionTokens: number;
			totalTokens: number;
		};
	};
	subscribe: (listener: (event: MockHarnessEvent) => void) => () => void;
	emit: (event: MockHarnessEvent) => void;
}

const harnesses: MockHarness[] = [];
const ensureCalls: Array<{
	sessionId: string;
	organizationId: string;
	workspaceId?: string;
}> = [];
const streamAppends = new Map<string, string[]>();
const flushCalls: string[] = [];
const detachCalls: string[] = [];

function createMockHarness(): MockHarness {
	let listeners: Array<(event: MockHarnessEvent) => void> = [];
	const harness: MockHarness = {
		resourceId: null,
		currentThreadId: null,
		aborts: 0,
		sendMessageCalls: [],
		switchModelCalls: [],
		toolApprovalCalls: [],
		questionCalls: [],
		planCalls: [],
		init: async () => {},
		setResourceId: ({ resourceId }) => {
			harness.resourceId = resourceId;
		},
		selectOrCreateThread: async () => {
			harness.currentThreadId = `thread-${harness.resourceId ?? "unknown"}`;
			return { id: harness.currentThreadId };
		},
		switchModel: async ({ modelId, scope }) => {
			harness.switchModelCalls.push({ modelId, scope });
		},
		sendMessage: async ({ content }) => {
			harness.sendMessageCalls.push({ content });
			await new Promise((resolve) => setTimeout(resolve, 0));
			harness.emit({ type: "agent_start" });
			harness.emit({
				type: "message_start",
				message: {
					id: `m-${harness.sendMessageCalls.length}`,
					role: "assistant",
					content: [{ type: "text", text: "" }],
					createdAt: new Date(),
				},
			});
			harness.emit({
				type: "message_update",
				message: {
					id: `m-${harness.sendMessageCalls.length}`,
					role: "assistant",
					content: [{ type: "text", text: `echo:${content}` }],
					createdAt: new Date(),
				},
			});
			harness.emit({
				type: "message_end",
				message: {
					id: `m-${harness.sendMessageCalls.length}`,
					role: "assistant",
					content: [{ type: "text", text: `echo:${content}` }],
					createdAt: new Date(),
					stopReason: "complete",
				},
			});
			harness.emit({ type: "agent_end", reason: "complete" });
		},
		abort: () => {
			harness.aborts += 1;
		},
		respondToToolApproval: ({ decision }) => {
			harness.toolApprovalCalls.push({ decision });
		},
		respondToQuestion: ({ questionId, answer }) => {
			harness.questionCalls.push({ questionId, answer });
		},
		respondToPlanApproval: async ({ planId, response }) => {
			harness.planCalls.push({ planId, response });
		},
		getDisplayState: () => ({
			isRunning: false,
			tokenUsage: {
				promptTokens: harness.sendMessageCalls.length,
				completionTokens: 0,
				totalTokens: harness.sendMessageCalls.length,
			},
		}),
		subscribe: (listener) => {
			listeners.push(listener);
			return () => {
				listeners = listeners.filter((entry) => entry !== listener);
			};
		},
		emit: (event) => {
			for (const listener of listeners) {
				listener(event);
			}
		},
	};
	return harness;
}

mock.module("mastracode", () => ({
	createMastraCode: () => {
		const harness = createMockHarness();
		harnesses.push(harness);
		return { harness };
	},
}));

mock.module("../../../events/durable-streams", () => ({
	ensureSessionStream: async (
		_config: unknown,
		input: { sessionId: string; organizationId: string; workspaceId?: string },
	) => {
		ensureCalls.push(input);
	},
	createSessionStreamProducer: (
		_config: unknown,
		sessionId: string,
	): {
		append: (payload: string) => void;
		flush: () => Promise<void>;
		detach: () => Promise<void>;
	} => {
		const events: string[] = [];
		streamAppends.set(sessionId, events);
		return {
			append: (payload: string) => {
				events.push(payload);
			},
			flush: async () => {
				flushCalls.push(sessionId);
			},
			detach: async () => {
				detachCalls.push(sessionId);
			},
		};
	},
}));

const runtime = await import("./runtime-state");

function readEnvelopes(sessionId: string): Array<{
	kind: string;
	sessionId: string;
	sequenceHint: number;
	payload: unknown;
}> {
	return (streamAppends.get(sessionId) ?? [])
		.map((entry) => JSON.parse(entry) as { value?: unknown })
		.map((entry) => entry.value)
		.filter(
			(
				entry,
			): entry is {
				kind: string;
				sessionId: string;
				sequenceHint: number;
				payload: unknown;
			} => Boolean(entry),
		);
}

function getHarnessForSession(sessionId: string): MockHarness {
	const harness = harnesses.find((entry) => entry.resourceId === sessionId);
	if (!harness) {
		throw new Error(`No harness found for session ${sessionId}`);
	}
	return harness;
}

beforeEach(async () => {
	await runtime.stopRuntimeService();
	ensureCalls.length = 0;
	flushCalls.length = 0;
	detachCalls.length = 0;
	harnesses.length = 0;
	streamAppends.clear();

	runtime.configureRuntimeState({
		streams: {
			apiBaseUrl: "http://localhost:3000",
		},
	});
	runtime.startRuntimeService("org-test");
});

afterEach(async () => {
	await runtime.stopRuntimeService();
});

describe("runtime-state", () => {
	it("ensures runtime, subscribes, and writes harness events", async () => {
		const result = await runtime.ensureRuntime({
			sessionId: sessionA,
			cwd: "/tmp/project-a",
			workspaceId: workspaceA,
		});

		expect(result).toEqual({ ready: true });
		expect(ensureCalls).toHaveLength(1);
		expect(ensureCalls[0]).toEqual({
			sessionId: sessionA,
			organizationId: "org-test",
			workspaceId: workspaceA,
		});

		const harness = getHarnessForSession(sessionA);
		harness.emit({ type: "agent_start" });

		const envelopes = readEnvelopes(sessionA);
		expect(envelopes).toHaveLength(1);
		expect(envelopes[0]).toMatchObject({
			kind: "harness",
			sessionId: sessionA,
			sequenceHint: 0,
			payload: { type: "agent_start" },
		});
	});

	it("writes submit event before harness stream events for sendMessage", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });

		const result = await runtime.sendMessage({
			sessionId: sessionA,
			content: "hello",
			clientMessageId: "client-1",
		});

		expect(result).toEqual({ accepted: true });

		const envelopes = readEnvelopes(sessionA);
		expect(envelopes.length).toBeGreaterThanOrEqual(2);
		expect(envelopes[0]).toMatchObject({
			kind: "submit",
			sessionId: sessionA,
			sequenceHint: 0,
			payload: {
				type: "user_message_submitted",
				data: {
					content: "hello",
					clientMessageId: "client-1",
				},
			},
		});
		expect(envelopes[1]?.kind).toBe("harness");
		expect((envelopes[1]?.payload as { type: string }).type).toBe(
			"agent_start",
		);
		expect(envelopes.map((entry) => entry.sequenceHint)).toEqual(
			Array.from({ length: envelopes.length }, (_, index) => index),
		);
	});

	it("switches model before sendMessage when metadata model is provided", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });

		const result = await runtime.sendMessage({
			sessionId: sessionA,
			content: "hello",
			metadata: {
				model: "openai/gpt-4o",
			},
		});
		expect(result).toEqual({ accepted: true });

		const harness = getHarnessForSession(sessionA);
		expect(harness.switchModelCalls).toEqual([
			{ modelId: "openai/gpt-4o", scope: "thread" },
		]);
	});

	it("serializes concurrent sendMessage calls per session", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });

		await Promise.all([
			runtime.sendMessage({ sessionId: sessionA, content: "first" }),
			runtime.sendMessage({ sessionId: sessionA, content: "second" }),
		]);

		const harness = getHarnessForSession(sessionA);
		expect(harness.sendMessageCalls.map((call) => call.content)).toEqual([
			"first",
			"second",
		]);

		const submitEvents = readEnvelopes(sessionA)
			.filter((entry) => entry.kind === "submit")
			.map(
				(entry) => entry.payload as { type: string; data: { content: string } },
			);

		expect(submitEvents.map((entry) => entry.data.content)).toEqual([
			"first",
			"second",
		]);
	});

	it("isolates events across multiple sessions", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });
		await runtime.ensureRuntime({ sessionId: sessionB, cwd: "/tmp/project-b" });

		await runtime.sendMessage({ sessionId: sessionA, content: "only-a" });
		await runtime.sendMessage({ sessionId: sessionB, content: "only-b" });

		const eventsA = readEnvelopes(sessionA);
		const eventsB = readEnvelopes(sessionB);

		expect(eventsA.length).toBeGreaterThan(0);
		expect(eventsB.length).toBeGreaterThan(0);
		expect(eventsA.every((event) => event.sessionId === sessionA)).toBeTrue();
		expect(eventsB.every((event) => event.sessionId === sessionB)).toBeTrue();
	});

	it("writes submit events for control/approval/question/plan and calls harness handlers", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });

		await runtime.control({ sessionId: sessionA, action: "stop" });
		await runtime.approvalRespond({
			sessionId: sessionA,
			decision: "approve",
			toolCallId: "tool-1",
		});
		await runtime.questionRespond({
			sessionId: sessionA,
			questionId: "question-1",
			answer: "yes",
		});
		await runtime.planRespond({
			sessionId: sessionA,
			planId: "plan-1",
			action: "reject",
			feedback: "needs changes",
		});

		const harness = getHarnessForSession(sessionA);
		expect(harness.aborts).toBe(1);
		expect(harness.toolApprovalCalls).toEqual([{ decision: "approve" }]);
		expect(harness.questionCalls).toEqual([
			{ questionId: "question-1", answer: "yes" },
		]);
		expect(harness.planCalls).toEqual([
			{
				planId: "plan-1",
				response: {
					action: "rejected",
					feedback: "needs changes",
				},
			},
		]);

		const submitTypes = readEnvelopes(sessionA)
			.filter((entry) => entry.kind === "submit")
			.map((entry) => (entry.payload as { type: string }).type);

		expect(submitTypes).toEqual([
			"control_submitted",
			"approval_submitted",
			"question_submitted",
			"plan_submitted",
		]);
	});

	it("returns runtime display state when available", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });
		await runtime.sendMessage({ sessionId: sessionA, content: "hello" });

		const result = runtime.getDisplayState({ sessionId: sessionA });
		expect(result.ready).toBeTrue();
		expect(result.reason).toBeUndefined();
		expect(result.displayState).toEqual({
			isRunning: false,
			tokenUsage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
		});
	});

	it("returns not-ready display state when runtime missing", () => {
		const result = runtime.getDisplayState({ sessionId: sessionA });
		expect(result).toEqual({
			ready: false,
			reason: "Runtime not active for session",
		});
	});

	it("flushes and detaches producer on stop", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });
		await runtime.stopRuntimeService();

		expect(flushCalls).toEqual([sessionA]);
		expect(detachCalls).toEqual([sessionA]);
		expect(runtime.hasRuntime(sessionA)).toBeFalse();
	});
});
