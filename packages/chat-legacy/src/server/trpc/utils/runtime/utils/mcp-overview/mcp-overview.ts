import { type MastraMCPServerDefinition, MCPClient } from "@mastra/mcp";
import type { RuntimeMcpServerStatus, RuntimeSession } from "../../runtime";

const MCP_AUTH_TIMEOUT_MS = 15_000;

type McpServerTransport = "remote" | "local" | "unknown";

type McpServerState = "enabled" | "disabled" | "invalid";

interface RuntimeMcpOverviewServer {
	name: string;
	state: McpServerState;
	transport: McpServerTransport;
	target: string;
	connected?: boolean;
	toolCount?: number;
	error?: string;
}

interface RuntimeMcpOverview {
	sourcePath: string | null;
	servers: RuntimeMcpOverviewServer[];
}

interface ParsedMcpConfig {
	type: string | null;
	url: string | null;
	httpUrl: string | null;
	command: string | null;
	commandLower: string | null;
	commandParts: string[];
	args: string[];
	disabled: boolean;
}

type McpProbeServerDefinition = MastraMCPServerDefinition;

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean);
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

function toConfigRecord(rawConfig: unknown): Record<string, unknown> {
	if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
		return {};
	}
	return rawConfig as Record<string, unknown>;
}

function parseMcpConfig(rawConfig: unknown): ParsedMcpConfig {
	const config = toConfigRecord(rawConfig);
	const type = toNonEmptyString(config.type)?.toLowerCase() ?? null;
	const url = toNonEmptyString(config.url);
	const httpUrl = toNonEmptyString(config.httpUrl);
	const command = toNonEmptyString(config.command);
	const commandLower = command?.toLowerCase() ?? null;
	const commandParts = toStringArray(config.command);
	const args = toStringArray(config.args);

	return {
		type,
		url,
		httpUrl,
		command,
		commandLower,
		commandParts,
		args,
		disabled: config.disabled === true || config.enabled === false,
	};
}

function findRemoteUrl(args: string[]): string | null {
	return args.find((arg) => /^https?:\/\//i.test(arg)) ?? null;
}

function isMcpRemote(config: ParsedMcpConfig): boolean {
	if (config.commandLower === "mcp-remote") {
		return true;
	}

	const matchesMcpRemote = (arg: string): boolean =>
		arg.toLowerCase() === "mcp-remote";
	return (
		config.commandParts.some(matchesMcpRemote) ||
		config.args.some(matchesMcpRemote)
	);
}

function resolveTransport(config: ParsedMcpConfig): McpServerTransport {
	if (
		config.url ||
		config.httpUrl ||
		config.type === "http" ||
		config.type === "remote"
	) {
		return "remote";
	}

	if (findRemoteUrl(config.args) || isMcpRemote(config)) {
		return "remote";
	}

	if (
		config.command ||
		config.commandParts.length > 0 ||
		config.type === "local" ||
		config.type === "stdio"
	) {
		return "local";
	}

	return "unknown";
}

function resolveTarget(
	config: ParsedMcpConfig,
	transport: McpServerTransport,
): string {
	if (transport === "remote") {
		return (
			config.url ??
			config.httpUrl ??
			findRemoteUrl(config.args) ??
			"Not configured"
		);
	}

	if (config.command) {
		return [config.command, ...config.args].join(" ");
	}

	if (config.commandParts.length > 0) {
		return config.commandParts.join(" ");
	}

	return "Not configured";
}

function resolveState(
	config: ParsedMcpConfig,
	transport: McpServerTransport,
	status?: RuntimeMcpServerStatus,
): McpServerState {
	if (config.disabled) {
		return "disabled";
	}

	if (transport === "unknown") {
		return "invalid";
	}

	if (status && !status.connected) {
		return "invalid";
	}

	return "enabled";
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

function toRuntimeStatusMap(
	runtime: RuntimeSession,
): Map<string, RuntimeMcpServerStatus> {
	const map = new Map<string, RuntimeMcpServerStatus>();

	const managerStatuses = runtime.mcpManager?.getServerStatuses() ?? [];
	for (const rawStatus of managerStatuses as unknown[]) {
		if (
			!rawStatus ||
			typeof rawStatus !== "object" ||
			Array.isArray(rawStatus)
		) {
			continue;
		}

		const status = rawStatus as Record<string, unknown>;
		const name = toNonEmptyString(status.name);
		if (!name) {
			continue;
		}

		const toolCount =
			typeof status.toolCount === "number" && Number.isFinite(status.toolCount)
				? status.toolCount
				: 0;
		const error = toNonEmptyString(status.error) ?? undefined;
		map.set(name, {
			connected: status.connected === true,
			toolCount,
			...(error ? { error } : {}),
		});
	}

	for (const [name, status] of runtime.mcpManualStatuses) {
		map.set(name, status);
	}

	return map;
}

function toOverviewServer(
	name: string,
	rawConfig: unknown,
	statusesByName: Map<string, RuntimeMcpServerStatus>,
): RuntimeMcpOverviewServer {
	const config = parseMcpConfig(rawConfig);
	const transport = resolveTransport(config);
	const status = statusesByName.get(name);

	return {
		name,
		state: resolveState(config, transport, status),
		transport,
		target: resolveTarget(config, transport),
		...(status
			? {
					connected: status.connected,
					toolCount: status.toolCount,
					...(status.error ? { error: status.error } : {}),
				}
			: {}),
	};
}

function buildOverview(
	sourcePath: string | null,
	mcpServers: Record<string, unknown>,
	statusesByName: Map<string, RuntimeMcpServerStatus>,
): RuntimeMcpOverview {
	const servers = Object.entries(mcpServers)
		.map(([name, rawConfig]) =>
			toOverviewServer(name, rawConfig, statusesByName),
		)
		.sort((left, right) => left.name.localeCompare(right.name));

	return {
		sourcePath,
		servers,
	};
}

function buildProbeServerDefinition(
	rawConfig: unknown,
): McpProbeServerDefinition | null {
	const config = toConfigRecord(rawConfig);
	const parsed = parseMcpConfig(rawConfig);
	const env = toStringRecord(config.env);
	const remoteUrl = parsed.url ?? parsed.httpUrl ?? findRemoteUrl(parsed.args);
	if (remoteUrl) {
		try {
			return { url: new URL(remoteUrl) };
		} catch {
			return null;
		}
	}

	if (parsed.command) {
		return {
			command: parsed.command,
			...(parsed.args.length > 0 ? { args: parsed.args } : {}),
			...(env ? { env } : {}),
		};
	}

	if (parsed.commandParts.length > 0) {
		const [command, ...commandArgs] = parsed.commandParts;
		if (!command) {
			return null;
		}
		const mergedArgs = [...commandArgs, ...parsed.args];
		return {
			command,
			...(mergedArgs.length > 0 ? { args: mergedArgs } : {}),
			...(env ? { env } : {}),
		};
	}

	return null;
}

async function probeMcpServer(
	serverName: string,
	serverDefinition: McpProbeServerDefinition,
): Promise<RuntimeMcpServerStatus> {
	let client: MCPClient | null = null;
	try {
		client = new MCPClient({
			id: `superset-chat-mcp-auth-${serverName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			timeout: MCP_AUTH_TIMEOUT_MS,
			servers: {
				[serverName]: serverDefinition,
			},
		});
		const tools = (await withTimeout(
			client.listTools(),
			MCP_AUTH_TIMEOUT_MS,
			`Timed out connecting to MCP server "${serverName}"`,
		)) as Record<string, unknown>;
		const namespacedPrefix = `${serverName}_`;
		const namespacedCount = Object.keys(tools).filter((toolName) =>
			toolName.startsWith(namespacedPrefix),
		).length;
		const toolCount =
			namespacedCount > 0 ? namespacedCount : Object.keys(tools).length;
		return {
			connected: true,
			toolCount,
		};
	} catch (error) {
		return {
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

export async function getRuntimeMcpOverview(
	runtime: RuntimeSession,
): Promise<RuntimeMcpOverview> {
	const manager = runtime.mcpManager;
	if (!manager || !manager.hasServers()) {
		return { sourcePath: null, servers: [] };
	}

	const config = manager.getConfig().mcpServers ?? {};
	const statusesByName = toRuntimeStatusMap(runtime);
	return buildOverview(
		manager.getConfigPaths().project,
		config,
		statusesByName,
	);
}

export async function authenticateRuntimeMcpServer(
	runtime: RuntimeSession,
	serverName: string,
): Promise<RuntimeMcpOverview> {
	const manager = runtime.mcpManager;
	if (!manager || !manager.hasServers()) {
		throw new Error("No MCP servers configured");
	}

	const trimmedServerName = serverName.trim();
	if (!trimmedServerName) {
		throw new Error("MCP server name is required");
	}

	const config = manager.getConfig().mcpServers ?? {};
	const serverConfig = config[trimmedServerName];
	if (!serverConfig) {
		throw new Error(`MCP server "${trimmedServerName}" is not configured`);
	}

	const serverDefinition = buildProbeServerDefinition(serverConfig);
	const status = serverDefinition
		? await probeMcpServer(trimmedServerName, serverDefinition)
		: {
				connected: false,
				toolCount: 0,
				error: "MCP server is not runnable from current config",
			};

	runtime.mcpManualStatuses.set(trimmedServerName, status);
	const statusesByName = toRuntimeStatusMap(runtime);
	return buildOverview(
		manager.getConfigPaths().project,
		config,
		statusesByName,
	);
}
