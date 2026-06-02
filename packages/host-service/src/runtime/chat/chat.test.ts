import { describe, expect, mock, test } from "bun:test";
import { ChatRuntimeManager } from "./chat";

/**
 * Minimal fake of the mastracode harness exposing only the surface the
 * sandbox-access-request handling touches: an event subscriber, a display
 * state, and respondToQuestion.
 */
function createMockHarness() {
	let subscriber: ((event: unknown) => void) | undefined;
	const respondToQuestion = mock(async () => ({ ok: true }));
	return {
		subscribe(cb: (event: unknown) => void) {
			subscriber = cb;
		},
		emit(event: unknown) {
			subscriber?.(event);
		},
		getDisplayState() {
			return { currentMessage: null, pendingQuestion: null };
		},
		respondToQuestion,
		// biome-ignore lint/suspicious/noExplicitAny: test stub
	} as any;
}

function createManager() {
	// db / runtimeResolver are unused by the code paths under test.
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	return new ChatRuntimeManager({ db: {} as any, runtimeResolver: {} as any });
}

function createRuntime(harness: ReturnType<typeof createMockHarness>) {
	const runtime = {
		sessionId: "session-1",
		workspaceId: "workspace-1",
		cwd: "/tmp/workspace",
		harness,
		mcpManager: null,
		hookManager: null,
		lastErrorMessage: null,
		pendingSandboxQuestions: [],
		answeredQuestionIds: new Set<string>(),
		pendingQuestionResponses: new Map(),
	};
	return runtime;
}

describe("sandbox access requests", () => {
	test("surfaces a second directory request after the first is answered", async () => {
		const manager = createManager();
		const harness = createMockHarness();
		const runtime = createRuntime(harness);

		// Register the runtime so manager.respondToQuestion resolves to it
		// without going through createRuntime (which needs a real harness/db).
		// biome-ignore lint/suspicious/noExplicitAny: reaching into private state for the test
		(manager as any).runtimes.set(runtime.sessionId, runtime);
		// biome-ignore lint/suspicious/noExplicitAny: invoking private subscriber wiring
		(manager as any).subscribeToSessionEvents(runtime);

		// The agent requests access to two directories in the same turn.
		harness.emit({
			type: "sandbox_access_request",
			questionId: "q-dir-a",
			path: "/repo/dir-a",
			reason: "needs dir a",
		});
		harness.emit({
			type: "sandbox_access_request",
			questionId: "q-dir-b",
			path: "/repo/dir-b",
			reason: "needs dir b",
		});

		// First request is surfaced.
		// biome-ignore lint/suspicious/noExplicitAny: private method
		const first = (manager as any).buildDisplayState(runtime);
		expect(first.pendingQuestion).not.toBeNull();
		// Requests are surfaced in arrival order (FIFO).
		const firstId = first.pendingQuestion.questionId;
		expect(firstId).toBe("q-dir-a");

		// User answers it.
		await manager.respondToQuestion({
			sessionId: runtime.sessionId,
			workspaceId: runtime.workspaceId,
			payload: { questionId: firstId, answer: "Yes" },
		});

		// The second directory request must still be surfaced so the session
		// can continue. With a single-slot field it is lost and this is null.
		// biome-ignore lint/suspicious/noExplicitAny: private method
		const second = (manager as any).buildDisplayState(runtime);
		expect(second.pendingQuestion).not.toBeNull();
		expect(second.pendingQuestion.questionId).not.toBe(firstId);

		// Answering the second clears the queue.
		await manager.respondToQuestion({
			sessionId: runtime.sessionId,
			workspaceId: runtime.workspaceId,
			payload: { questionId: second.pendingQuestion.questionId, answer: "Yes" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: private method
		const third = (manager as any).buildDisplayState(runtime);
		expect(third.pendingQuestion).toBeNull();
	});
});
