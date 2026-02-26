import { createMastraCode } from "mastracode";

export type RuntimeHarness = Awaited<
	ReturnType<typeof createMastraCode>
>["harness"];
export type RuntimeMcpManager = Awaited<
	ReturnType<typeof createMastraCode>
>["mcpManager"];
export type RuntimeHookManager = Awaited<
	ReturnType<typeof createMastraCode>
>["hookManager"];
export type RuntimeDisplayState = ReturnType<RuntimeHarness["getDisplayState"]>;

export interface RuntimeSession {
	sessionId: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
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
	if (runtimeMastra.mcpManager?.hasServers()) {
		await runtimeMastra.mcpManager.init();
	}
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
		mcpManager: runtimeMastra.mcpManager,
		hookManager: runtimeMastra.hookManager,
		cwd: runtimeCwd,
		lastIsRunning: false,
	};
	runtimes.set(sessionId, runtime);
	return runtime;
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const items = value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean);
	return items.length > 0 ? items : null;
}

function resolveTransport(config: Record<string, unknown>): "remote" | "local" {
	const command = toNonEmptyString(config.command)?.toLowerCase();
	const args = toStringArray(config.args) ?? [];
	const hasRemoteUrl = args.some((arg) => /^https?:\/\//i.test(arg));
	const isMcpRemote =
		command === "mcp-remote" ||
		args.some((arg) => arg.toLowerCase() === "mcp-remote");
	return hasRemoteUrl || isMcpRemote ? "remote" : "local";
}

function resolveTarget(
	config: Record<string, unknown>,
	transport: "remote" | "local",
): string {
	if (transport === "remote") {
		const args = toStringArray(config.args) ?? [];
		const remoteUrl = args.find((arg) => /^https?:\/\//i.test(arg));
		if (remoteUrl) {
			return remoteUrl;
		}
	}

	const command = toNonEmptyString(config.command);
	const args = toStringArray(config.args) ?? [];
	if (!command) {
		return "Not configured";
	}

	return [command, ...args].join(" ");
}

export async function getRuntimeMcpOverview(runtime: RuntimeSession): Promise<{
	sourcePath: string | null;
	servers: Array<{
		name: string;
		state: "enabled" | "disabled" | "invalid";
		transport: "remote" | "local" | "unknown";
		target: string;
	}>;
}> {
	const manager = runtime.mcpManager;
	if (!manager || !manager.hasServers()) {
		return { sourcePath: null, servers: [] };
	}

	if (manager.getServerStatuses().length === 0) {
		await manager.init();
	}

	const statusesByName = new Map(
		manager.getServerStatuses().map((status) => [status.name, status]),
	);
	const config = manager.getConfig().mcpServers ?? {};
	const servers: Array<{
		name: string;
		state: "enabled" | "disabled" | "invalid";
		transport: "remote" | "local" | "unknown";
		target: string;
	}> = Object.entries(config)
		.map(([name, rawConfig]) => {
			const normalizedConfig = rawConfig as unknown as Record<string, unknown>;
			const transport = resolveTransport(normalizedConfig);
			const status = statusesByName.get(name);
			const state: "enabled" | "invalid" = status?.connected
				? "enabled"
				: "invalid";
			return {
				name,
				state,
				transport,
				target: resolveTarget(normalizedConfig, transport),
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));

	return {
		sourcePath: manager.getConfigPaths().project,
		servers,
	};
}
