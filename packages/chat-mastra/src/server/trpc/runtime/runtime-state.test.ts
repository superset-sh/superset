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
	toolApprovalCalls: Array<{ decision: string }>;
	questionCalls: Array<{ questionId: string; answer: string }>;
	planCalls: Array<{
		planId: string;
		response: { action: string; feedback?: string };
	}>;
	init: () => Promise<void>;
	setResourceId: ({ resourceId }: { resourceId: string }) => void;
	selectOrCreateThread: () => Promise<{ id: string }>;
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

function createMockHarness(): MockHarness {
	let listeners: Array<(event: MockHarnessEvent) => void> = [];
	const harness: MockHarness = {
		resourceId: null,
		currentThreadId: null,
		aborts: 0,
		sendMessageCalls: [],
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
		sendMessage: async ({ content }) => {
			harness.sendMessageCalls.push({ content });
			await new Promise((resolve) => setTimeout(resolve, 0));
			harness.emit({ type: "agent_start" });
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

const runtime = await import("./runtime-state");

function getHarnessForSession(sessionId: string): MockHarness {
	const harness = harnesses.find((entry) => entry.resourceId === sessionId);
	if (!harness) {
		throw new Error(`No harness found for session ${sessionId}`);
	}
	return harness;
}

beforeEach(async () => {
	await runtime.stopRuntimeService();
	harnesses.length = 0;
	runtime.startRuntimeService("org-test");
});

afterEach(async () => {
	await runtime.stopRuntimeService();
});

describe("runtime-state", () => {
	it("ensures runtime and binds a harness to the session", async () => {
		const result = await runtime.ensureRuntime({
			sessionId: sessionA,
			cwd: "/tmp/project-a",
			workspaceId: workspaceA,
		});

		expect(result).toEqual({ ready: true });
		expect(runtime.hasRuntime(sessionA)).toBeTrue();

		const harness = getHarnessForSession(sessionA);
		expect(harness.resourceId).toBe(sessionA);
		expect(harness.currentThreadId).toBe(`thread-${sessionA}`);
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
	});

	it("isolates runtime operations across sessions", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });
		await runtime.ensureRuntime({ sessionId: sessionB, cwd: "/tmp/project-b" });

		await runtime.sendMessage({ sessionId: sessionA, content: "only-a" });
		await runtime.sendMessage({ sessionId: sessionB, content: "only-b" });

		const harnessA = getHarnessForSession(sessionA);
		const harnessB = getHarnessForSession(sessionB);
		expect(harnessA.sendMessageCalls.map((call) => call.content)).toEqual([
			"only-a",
		]);
		expect(harnessB.sendMessageCalls.map((call) => call.content)).toEqual([
			"only-b",
		]);
	});

	it("routes control/approval/question/plan actions to harness handlers", async () => {
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

	it("returns not-ready display state when runtime is missing", () => {
		const result = runtime.getDisplayState({ sessionId: sessionA });
		expect(result).toEqual({
			ready: false,
			reason: "Runtime not active for session",
		});
	});

	it("clears active runtimes on stop", async () => {
		await runtime.ensureRuntime({ sessionId: sessionA, cwd: "/tmp/project-a" });
		await runtime.stopRuntimeService();

		expect(runtime.hasRuntime(sessionA)).toBeFalse();
	});
});
