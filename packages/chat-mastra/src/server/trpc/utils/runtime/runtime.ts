import { MCPClient } from "@mastra/mcp";
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
type RuntimeHarnessEvent = Parameters<
	Parameters<RuntimeHarness["subscribe"]>[0]
>[0];
type RuntimeAgentEndEvent = Extract<RuntimeHarnessEvent, { type: "agent_end" }>;

export interface RuntimeSession {
	sessionId: string;
	harness: RuntimeHarness;
	mcpManager: RuntimeMcpManager;
	hookManager: RuntimeHookManager;
	cwd: string;
}

const runtimes = new Map<string, RuntimeSession>();
const debugHooksOverride = process.env.SUPERSET_DEBUG_HOOKS?.trim();
const DEBUG_HOOKS_ENABLED =
	debugHooksOverride === undefined
		? process.env.NODE_ENV !== "production"
		: !/^(0|false)$/i.test(debugHooksOverride);
const MCP_PROBE_TIMEOUT_MS = 15_000;

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

function toStopReason(
	event: RuntimeAgentEndEvent,
): "complete" | "aborted" | "error" {
	if (event.reason === "aborted") return "aborted";
	if (event.reason === "error") return "error";
	return "complete";
}

function subscribeRuntimeHooks(runtime: RuntimeSession): void {
	runtime.harness.subscribe(async (event) => {
		if (event.type !== "agent_end") return;

		try {
			await runStopHook(runtime, toStopReason(event));
		} catch (error) {
			if (DEBUG_HOOKS_ENABLED) {
				console.warn("[chat-mastra] failed to emit Stop hook", {
					sessionId: runtime.sessionId,
					error:
						error instanceof Error
							? error.message
							: "Unknown hook execution error",
				});
			}
		}
	});
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
		try {
			await runtimeMastra.mcpManager.init();
		} catch (error) {
			console.warn("[chat-mastra] MCP init failed during runtime creation", {
				sessionId,
				cwd: runtimeCwd,
				error: toErrorMessage(error),
			});
		}
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
	};
	subscribeRuntimeHooks(runtime);
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

function toStringRecord(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	const entries = Object.entries(value).filter(
		([key, item]) => key.trim().length > 0 && typeof item === "string",
	);
	if (entries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(entries);
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		return (error as { message: string }).message;
	}
	return "Unknown MCP error";
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutMessage: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

function buildMcpServerDefinition(rawConfig: Record<string, unknown>): {
	command: string;
	args?: string[];
	env?: Record<string, string>;
} | null {
	const command = toNonEmptyString(rawConfig.command);
	if (!command) return null;

	const args = toStringArray(rawConfig.args) ?? undefined;
	const env = toStringRecord(rawConfig.env);

	return { command, ...(args ? { args } : {}), ...(env ? { env } : {}) };
}

interface ProbedMcpServerStatus {
	name: string;
	connected: boolean;
	toolCount: number;
	error?: string;
}

async function probeMcpServerStatus(
	name: string,
	rawConfig: Record<string, unknown>,
): Promise<ProbedMcpServerStatus> {
	const serverDefinition = buildMcpServerDefinition(rawConfig);
	if (!serverDefinition) {
		return {
			name,
			connected: false,
			toolCount: 0,
			error: "MCP server command is not configured",
		};
	}

	let client: MCPClient | null = null;

	try {
		client = new MCPClient({
			id: `superset-chat-mcp-probe-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			timeout: MCP_PROBE_TIMEOUT_MS,
			servers: { [name]: serverDefinition },
		});
		const tools = await withTimeout(
			client.listTools(),
			MCP_PROBE_TIMEOUT_MS,
			`Timed out connecting to MCP server "${name}"`,
		);
		const namespacedPrefix = `${name}_`;
		const toolCount = Object.keys(tools as Record<string, unknown>).filter(
			(toolName) => toolName.startsWith(namespacedPrefix),
		).length;
		return { name, connected: true, toolCount };
	} catch (error) {
		return {
			name,
			connected: false,
			toolCount: 0,
			error: toErrorMessage(error),
		};
	} finally {
		if (client) {
			await client.disconnect().catch(() => undefined);
		}
	}
}

function shouldRunPerServerProbe(
	configEntries: Array<[string, unknown]>,
	statuses: Array<{
		name: string;
		connected: boolean;
		error?: string;
	}>,
): boolean {
	if (configEntries.length === 0) {
		return false;
	}

	if (statuses.length === 0) {
		return true;
	}

	if (statuses.some((status) => status.connected)) {
		return false;
	}

	if (statuses.length !== configEntries.length) {
		return true;
	}

	const normalizedErrors = new Set(
		statuses.map((status) => toNonEmptyString(status.error) ?? "unknown"),
	);
	return normalizedErrors.size <= 1;
}

function resolveTransport(
	config: Record<string, unknown>,
): "remote" | "local" | "unknown" {
	const command = toNonEmptyString(config.command)?.toLowerCase();
	const args = toStringArray(config.args) ?? [];
	if (!command && args.length === 0) {
		return "unknown";
	}
	const hasRemoteUrl = args.some((arg) => /^https?:\/\//i.test(arg));
	const isMcpRemote =
		command === "mcp-remote" ||
		args.some((arg) => arg.toLowerCase() === "mcp-remote");
	return hasRemoteUrl || isMcpRemote ? "remote" : "local";
}

function resolveTarget(
	config: Record<string, unknown>,
	transport: "remote" | "local" | "unknown",
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
		try {
			await manager.init();
		} catch (error) {
			console.warn("[chat-mastra] MCP init failed during overview", {
				sessionId: runtime.sessionId,
				error: toErrorMessage(error),
			});
		}
	}

	const rawStatuses = manager.getServerStatuses();
	const statusesByName = new Map(
		rawStatuses.map((status) => [status.name, status]),
	);
	const config = manager.getConfig().mcpServers ?? {};
	const configEntries = Object.entries(config);
	const perServerStatusesByName = shouldRunPerServerProbe(
		configEntries,
		rawStatuses,
	)
		? new Map(
				(
					await Promise.all(
						configEntries.map(([name, rawConfig]) =>
							probeMcpServerStatus(
								name,
								rawConfig as unknown as Record<string, unknown>,
							),
						),
					)
				).map((status) => [status.name, status]),
			)
		: null;
	const servers: Array<{
		name: string;
		state: "enabled" | "disabled" | "invalid";
		transport: "remote" | "local" | "unknown";
		target: string;
	}> = configEntries
		.map(([name, rawConfig]) => {
			const normalizedConfig = rawConfig as unknown as Record<string, unknown>;
			const transport = resolveTransport(normalizedConfig);
			const status = statusesByName.get(name);
			const probedStatus = perServerStatusesByName?.get(name);
			const isConnected =
				probedStatus?.connected ?? Boolean(status?.connected ?? false);
			const isDisabled =
				normalizedConfig.disabled === true ||
				normalizedConfig.enabled === false;
			const state: "enabled" | "disabled" | "invalid" = isDisabled
				? "disabled"
				: isConnected
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
