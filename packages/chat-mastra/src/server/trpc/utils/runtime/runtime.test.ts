import { describe, expect, it } from "bun:test";
import { type RuntimeSession, subscribeToSessionEvents } from "./runtime";

function createRuntimeForTest(): {
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
