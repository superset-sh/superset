import type { RuntimeSession } from "./runtime";

export async function runUserPromptHook(
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

export async function runStopHook(
	runtime: RuntimeSession,
	stopReason: "complete" | "aborted" | "error",
): Promise<void> {
	if (!runtime.hookManager) return;
	runtime.hookManager.setSessionId(runtime.sessionId);
	await runtime.hookManager.runStop(undefined, stopReason);
}
