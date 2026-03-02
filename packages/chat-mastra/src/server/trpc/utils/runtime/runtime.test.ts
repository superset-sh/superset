import { describe, expect, it } from "bun:test";
import { type RuntimeSession, subscribeToSessionEvents } from "./runtime";

function createRuntimeForTest(
	harnessOverrides?: Partial<RuntimeSession["harness"]>,
): {
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
		respondToQuestion: (_params: { questionId: string; answer: string }) => {},
		...harnessOverrides,
	} as RuntimeSession["harness"];

	const runtime: RuntimeSession = {
		sessionId: "11111111-1111-1111-1111-111111111111",
		harness,
		mcpManager: null as RuntimeSession["mcpManager"],
		hookManager: null as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		lastErrorMessage: null,
		cwd: "/tmp",
	};

	const apiClient = {
		chat: {
			updateTitle: {
				mutate: async () => ({}),
			},
		},
	} as unknown as Parameters<typeof subscribeToSessionEvents>[1];

	subscribeToSessionEvents(runtime, apiClient);

	return {
		runtime,
		emit: (event: unknown) => {
			if (!listener) throw new Error("Harness listener was not registered");
			listener(event);
		},
	};
}

describe("sandbox_access_request handling", () => {
	it("auto-denies sandbox_access_request to prevent indefinite hang in chat interface", () => {
		// The request_sandbox_access mastracode tool uses harnessCtx.registerQuestion +
		// harnessCtx.emitEvent({ type: "sandbox_access_request", ... }) to wait for user
		// approval. In the TUI this is handled by a dialog. In the Superset chat interface
		// no handler was registered, so the promise never resolved and the tool call hung
		// indefinitely with a loading spinner. The fix: subscribeToSessionEvents must
		// detect sandbox_access_request events and call respondToQuestion to unblock the
		// pending promise.
		const calls: Array<{ questionId: string; answer: string }> = [];

		const { emit } = createRuntimeForTest({
			respondToQuestion: (params: { questionId: string; answer: string }) => {
				calls.push(params);
			},
		});

		emit({
			type: "sandbox_access_request",
			questionId: "sandbox_1_1234567890",
			path: "/Users/user/.zshrc",
			reason: "Need to edit shell config",
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.questionId).toBe("sandbox_1_1234567890");
		// Answer must not start with "y" or equal "approve" so the tool resolves as denied
		expect(calls[0]?.answer).not.toMatch(/^y/i);
		expect(calls[0]?.answer).not.toBe("approve");
	});
});

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
});
