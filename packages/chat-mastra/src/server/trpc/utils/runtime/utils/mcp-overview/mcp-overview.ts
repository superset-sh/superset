import { MCPClient } from "@mastra/mcp";
import type { RuntimeSession } from "../../runtime";

const MCP_PROBE_TIMEOUT_MS = 15_000;

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
