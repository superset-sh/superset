import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { RuntimeSession } from "./runtime";

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Gate: validates user prompt against hooks before sending.
 * Throws if the hook blocks the message.
 */
export async function onUserPromptSubmit(
	runtime: RuntimeSession,
	userMessage: string,
): Promise<void> {
	if (!runtime.hookManager) return;
	runtime.hookManager.setSessionId(runtime.sessionId);
	const result = await runtime.hookManager.runUserPromptSubmit(userMessage);
	if (!result.allowed) {
		throw new Error(result.blockReason ?? "Blocked by UserPromptSubmit hook");
	}
}

/**
 * Subscribe to harness lifecycle events for a runtime session.
 * Call once after creating a runtime — handles stop hooks and title generation.
 */
export function subscribeToSessionEvents(
	runtime: RuntimeSession,
	apiClient: ApiClient,
): void {
	runtime.harness.subscribe((event) => {
		if (event.type === "agent_end") {
			onAgentEnd(runtime, event.reason ?? "complete", apiClient);
		}
	});
}

function onAgentEnd(
	runtime: RuntimeSession,
	reason: "complete" | "aborted" | "error",
	apiClient: ApiClient,
): void {
	if (runtime.hookManager) {
		runtime.hookManager.setSessionId(runtime.sessionId);
		void runtime.hookManager.runStop(undefined, reason).catch(() => {});
	}
	if (reason === "complete") {
		void maybeGenerateTitle(runtime.sessionId, apiClient);
	}
}

async function maybeGenerateTitle(
	sessionId: string,
	apiClient: ApiClient,
): Promise<void> {
	const title = "New conversation";
	await apiClient.chat.updateTitle.mutate({ sessionId, title });
}
