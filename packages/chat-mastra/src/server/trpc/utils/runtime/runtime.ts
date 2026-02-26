import { createMastraCode } from "mastracode";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];
export type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;

export interface RuntimeSession {
	sessionId: string;
	harness: RuntimeHarness;
	hookManager: RuntimeHookManager;
	cwd: string;
	lastIsRunning: boolean;
}

const runtimes = new Map<string, RuntimeSession>();
const debugHooksOverride = process.env.SUPERSET_DEBUG_HOOKS?.trim();
const DEBUG_HOOKS_ENABLED =
	debugHooksOverride === undefined
		? process.env.NODE_ENV !== "production"
		: !/^(0|false)$/i.test(debugHooksOverride);

type HookEventResult = NonNullable<
	Awaited<ReturnType<NonNullable<RuntimeHookManager>["runUserPromptSubmit"]>>
>;

function logHookResult(
	runtime: RuntimeSession,
	event: string,
	result: HookEventResult,
): void {
	if (!DEBUG_HOOKS_ENABLED) return;

	console.log("[chat-mastra] hook executed", {
		sessionId: runtime.sessionId,
		event,
		allowed: result.allowed,
		blockReason: result.blockReason,
		warnings: result.warnings,
		resultCount: result.results.length,
	});
}

export async function runUserPromptHook(
	runtime: RuntimeSession,
	userMessage: string,
): Promise<void> {
	if (!runtime.hookManager) return;
	runtime.hookManager.setSessionId(runtime.sessionId);
	const result = await runtime.hookManager.runUserPromptSubmit(userMessage);
	logHookResult(runtime, "UserPromptSubmit", result);
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
	const result = await runtime.hookManager.runStop(undefined, stopReason);
	logHookResult(runtime, "Stop", result);
}

export function onDisplayStateObserved(
	runtime: RuntimeSession,
	displayState: RuntimeDisplayState,
): void {
	const isRunning = Boolean(displayState?.isRunning);
	const wasRunning = runtime.lastIsRunning;
	runtime.lastIsRunning = isRunning;

	if (wasRunning && !isRunning) {
		void runStopHook(runtime, "complete").catch((error) => {
			if (DEBUG_HOOKS_ENABLED) {
				console.warn("[chat-mastra] failed to emit Stop hook", {
					sessionId: runtime.sessionId,
					error:
						error instanceof Error
							? error.message
							: "Unknown hook execution error",
				});
			}
		});
	}
}

export async function getOrCreateRuntime(
	sessionId: string,
	cwd?: string,
): Promise<RuntimeSession> {
	const existing = runtimes.get(sessionId);
	if (existing) {
		if (cwd && existing.cwd !== cwd) {
			existing.cwd = cwd;
			runtimes.set(sessionId, existing);
		}
		return existing;
	}

	const runtimeCwd = cwd ?? process.cwd();
	const runtimeMastra = await createMastraCode({ cwd: runtimeCwd });
	runtimeMastra.hookManager?.setSessionId(sessionId);
	if (DEBUG_HOOKS_ENABLED) {
		const hookManager = runtimeMastra.hookManager;
		if (!hookManager) {
			console.log("[chat-mastra] hook manager unavailable", {
				sessionId,
				cwd: runtimeCwd,
			});
		} else {
			const hookConfig = hookManager.getConfig();
			console.log("[chat-mastra] hook manager initialized", {
				sessionId,
				cwd: runtimeCwd,
				hasHooks: hookManager.hasHooks(),
				events: Object.keys(hookConfig),
				paths: hookManager.getConfigPaths(),
			});
		}
	}
	await runtimeMastra.harness.init();
	runtimeMastra.harness.setResourceId({ resourceId: sessionId });
	await runtimeMastra.harness.selectOrCreateThread();

	const runtime: RuntimeSession = {
		sessionId,
		harness: runtimeMastra.harness,
		hookManager: runtimeMastra.hookManager,
		cwd: runtimeCwd,
		lastIsRunning: false,
	};
	runtimes.set(sessionId, runtime);
	return runtime;
}
