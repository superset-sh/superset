import { describe, expect, it, mock } from "bun:test";
import type { RuntimeSession } from "./utils/runtime";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CWD = "/tmp/project";

mock.module("mastracode", () => ({
	createAuthStorage: mock(() => ({
		reload: () => {},
		get: () => undefined,
	})),
	createMastraCode: mock(async () => ({
		harness: {},
		mcpManager: null,
		hookManager: null,
		authStorage: null,
		storageWarning: undefined,
	})),
}));

const { ChatRuntimeService } = await import("./service");

function createRuntime(options?: {
	respondToQuestion?: RuntimeSession["harness"]["respondToQuestion"];
}): RuntimeSession {
	return {
		sessionId: SESSION_ID,
		cwd: CWD,
		harness: {
			abort: mock(() => {}),
			respondToToolApproval: mock(async (payload: unknown) => payload),
			respondToQuestion:
				options?.respondToQuestion ?? mock(async (payload: unknown) => payload),
			respondToPlanApproval: mock(async (payload: unknown) => payload),
		} as unknown as RuntimeSession["harness"],
		mcpManager: null as RuntimeSession["mcpManager"],
		hookManager: null as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		lastErrorMessage: null,
		pendingSandboxQuestion: {
			questionId: "sandbox-1",
			path: "/tmp/secret",
			reason: "Need access",
		},
		answeredQuestionIds: new Set(),
		pendingQuestionResponses: new Map(),
	};
}

function createServiceHarness(options?: Parameters<typeof createRuntime>[0]) {
	const runtime = createRuntime(options);
	const service = new ChatRuntimeService({
		headers: async () => ({}),
		apiUrl: "http://localhost:3000",
	});
	const getOrCreateRuntime = mock(
		async (_sessionId: string, _cwd?: string) => runtime,
	);

	(
		service as unknown as {
			getOrCreateRuntime: typeof getOrCreateRuntime;
		}
	).getOrCreateRuntime = getOrCreateRuntime;

	const caller = service.createRouter().createCaller({});

	return {
		caller,
		getOrCreateRuntime,
		runtime,
		abort: runtime.harness.abort as ReturnType<typeof mock>,
		respondToToolApproval: runtime.harness.respondToToolApproval as ReturnType<
			typeof mock
		>,
		respondToQuestion: runtime.harness.respondToQuestion as ReturnType<
			typeof mock
		>,
		respondToPlanApproval: runtime.harness.respondToPlanApproval as ReturnType<
			typeof mock
		>,
	};
}

describe("ChatRuntimeService control mutations", () => {
	it("passes cwd through stop and abort mutations", async () => {
		const { caller, getOrCreateRuntime, abort } = createServiceHarness();

		await caller.session.stop({ sessionId: SESSION_ID, cwd: CWD });
		await caller.session.abort({ sessionId: SESSION_ID, cwd: CWD });

		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(1, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(2, SESSION_ID, CWD);
		expect(abort).toHaveBeenCalledTimes(2);
	});

	it("passes cwd through approval, question, and plan responses", async () => {
		const {
			caller,
			getOrCreateRuntime,
			runtime,
			respondToPlanApproval,
			respondToQuestion,
			respondToToolApproval,
		} = createServiceHarness();

		await caller.session.approval.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: { decision: "approve" },
		});
		await caller.session.question.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: { questionId: "sandbox-1", answer: "Yes" },
		});
		await caller.session.plan.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: {
				planId: "plan-1",
				response: { action: "approved", feedback: "ship it" },
			},
		});

		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(1, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(2, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(3, SESSION_ID, CWD);
		expect(respondToToolApproval).toHaveBeenCalledWith({
			decision: "approve",
		});
		expect(respondToQuestion).toHaveBeenCalledWith({
			questionId: "sandbox-1",
			answer: "Yes",
		});
		expect(respondToPlanApproval).toHaveBeenCalledWith({
			planId: "plan-1",
			response: { action: "approved", feedback: "ship it" },
		});
		expect(runtime.pendingSandboxQuestion).toBeNull();
	});

	it("does not clear pending question state when question response fails", async () => {
		const respondToQuestion = mock(async () => {
			throw new Error("failed to answer");
		}) as RuntimeSession["harness"]["respondToQuestion"];
		const { caller, runtime } = createServiceHarness({ respondToQuestion });

		await expect(
			caller.session.question.respond({
				sessionId: SESSION_ID,
				cwd: CWD,
				payload: { questionId: "sandbox-1", answer: "Yes" },
			}),
		).rejects.toThrow("failed to answer");

		expect(runtime.answeredQuestionIds.has("sandbox-1")).toBe(false);
		expect(runtime.pendingSandboxQuestion).toEqual({
			questionId: "sandbox-1",
			path: "/tmp/secret",
			reason: "Need access",
		});
	});

	it("deduplicates concurrent responses for the same question", async () => {
		let resolveResponse: (value: unknown) => void = () => {};
		const respondToQuestion = mock(
			() =>
				new Promise((resolve) => {
					resolveResponse = resolve;
				}),
		) as RuntimeSession["harness"]["respondToQuestion"];
		const { caller, runtime } = createServiceHarness({ respondToQuestion });
		const payload = { questionId: "sandbox-1", answer: "Yes" };

		const firstResponse = caller.session.question.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload,
		});
		const secondResponse = caller.session.question.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload,
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(respondToQuestion).toHaveBeenCalledTimes(1);
		expect(runtime.answeredQuestionIds.has("sandbox-1")).toBe(true);
		expect(runtime.pendingSandboxQuestion).toBeNull();

		resolveResponse({ ok: true });

		await expect(firstResponse).resolves.toEqual({ ok: true });
		await expect(secondResponse).resolves.toEqual({ ok: true });
		expect(runtime.pendingQuestionResponses.size).toBe(0);
	});
});
