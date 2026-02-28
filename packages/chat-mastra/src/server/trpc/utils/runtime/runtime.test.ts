import { describe, expect, it } from "bun:test";
import type { RuntimeSession } from "./runtime";
import {
	extractRuntimeErrorMessage,
	normalizeRuntimeErrorMessage,
	subscribeToSessionEvents,
} from "./runtime";

function createEventRuntime(): {
	runtime: RuntimeSession;
	emit: (event: unknown) => void;
	stopReasons: string[];
} {
	let subscriber: ((event: unknown) => void) | null = null;
	const stopReasons: string[] = [];

	const runtime = {
		sessionId: "session_test",
		harness: {
			subscribe(callback: (event: unknown) => void) {
				subscriber = callback;
			},
			listMessages: async () => [],
			getCurrentMode: () => ({
				agent: {
					generateTitleFromUserMessage: async () => "",
				},
			}),
			getFullModelId: () => "model-id",
		},
		mcpManager: {},
		hookManager: {
			runStop: (_: unknown, reason: string) => {
				stopReasons.push(reason);
				return Promise.resolve();
			},
		},
		mcpManualStatuses: new Map(),
		cwd: "/tmp/workspace",
		lastErrorMessage: "previous error",
	} as unknown as RuntimeSession;

	return {
		runtime,
		emit: (event: unknown) => subscriber?.(event),
		stopReasons,
	};
}

describe("normalizeRuntimeErrorMessage", () => {
	it("strips AI_APICallErrorN prefixes", () => {
		expect(
			normalizeRuntimeErrorMessage(
				"AI_APICallError2: AI_APICallError9: Upstream provider timed out",
			),
		).toBe("Upstream provider timed out");
	});
});

describe("extractRuntimeErrorMessage", () => {
	it("extracts nested provider errors from runtime event shapes", () => {
		const message = extractRuntimeErrorMessage({
			type: "workspace_error",
			error: {
				cause: {
					responseBody: {
						error: {
							message: "AI_APICallError5: Rate limit exceeded",
						},
					},
				},
			},
		});

		expect(message).toBe("Rate limit exceeded");
	});
});

describe("subscribeToSessionEvents", () => {
	it("captures error and workspace_error messages and clears on agent_start", () => {
		const { runtime, emit } = createEventRuntime();
		subscribeToSessionEvents(
			runtime,
			{
				chat: { updateTitle: { mutate: async () => undefined } },
			} as never,
		);

		emit({
			type: "error",
			error: {
				cause: {
					responseBody: {
						error: { message: "AI_APICallError3: Provider unavailable" },
					},
				},
			},
		});
		expect(runtime.lastErrorMessage).toBe("Provider unavailable");

		emit({
			type: "workspace_error",
			payload: {
				error: "Workspace failed to initialize",
			},
		});
		expect(runtime.lastErrorMessage).toBe("Workspace failed to initialize");

		emit({ type: "agent_start" });
		expect(runtime.lastErrorMessage).toBeNull();
	});

	it("does not clear lastErrorMessage on agent_end complete", () => {
		const { runtime, emit, stopReasons } = createEventRuntime();
		runtime.lastErrorMessage = "Keep this error visible";
		subscribeToSessionEvents(
			runtime,
			{
				chat: { updateTitle: { mutate: async () => undefined } },
			} as never,
		);

		emit({ type: "agent_end", reason: "complete" });

		expect(runtime.lastErrorMessage).toBe("Keep this error visible");
		expect(stopReasons).toEqual(["complete"]);
	});
});
