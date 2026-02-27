import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { RuntimeDisplayState, RuntimeSession } from "./runtime";
import { runStopHook } from "./hooks";

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export function onDisplayStateObserved(
	runtime: RuntimeSession,
	displayState: RuntimeDisplayState,
	apiClient: ApiClient,
): void {
	const isRunning = Boolean(displayState?.isRunning);
	const wasRunning = runtime.lastIsRunning;
	runtime.lastIsRunning = isRunning;

	if (wasRunning && !isRunning) {
		onRunComplete(runtime, apiClient);
	}
}

function onRunComplete(runtime: RuntimeSession, apiClient: ApiClient): void {
	void runStopHook(runtime, "complete").catch(() => {});
	void maybeGenerateTitle(runtime.sessionId, apiClient);
}

async function maybeGenerateTitle(
	sessionId: string,
	apiClient: ApiClient,
): Promise<void> {
	const title = "New conversation";
	await apiClient.chat.updateTitle.mutate({ sessionId, title });
}
