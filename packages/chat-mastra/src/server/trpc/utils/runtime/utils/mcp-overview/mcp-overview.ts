import type { RuntimeSession } from "../../runtime";

type McpServerTransport = "remote" | "local" | "unknown";

type McpServerState = "enabled" | "disabled" | "invalid";

interface RuntimeMcpOverviewServer {
	name: string;
	state: McpServerState;
	transport: McpServerTransport;
	target: string;
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
): McpServerState {
	if (config.disabled) {
		return "disabled";
	}

	if (transport === "unknown") {
		return "invalid";
	}

	return "enabled";
}

function toOverviewServer(
	name: string,
	rawConfig: unknown,
): RuntimeMcpOverviewServer {
	const config = parseMcpConfig(rawConfig);
	const transport = resolveTransport(config);

	return {
		name,
		state: resolveState(config, transport),
		transport,
		target: resolveTarget(config, transport),
	};
}

export async function getRuntimeMcpOverview(
	runtime: RuntimeSession,
): Promise<RuntimeMcpOverview> {
	const manager = runtime.mcpManager;
	if (!manager || !manager.hasServers()) {
		return { sourcePath: null, servers: [] };
	}

	const config = manager.getConfig().mcpServers ?? {};
	const servers = Object.entries(config)
		.map(([name, rawConfig]) => toOverviewServer(name, rawConfig))
		.sort((left, right) => left.name.localeCompare(right.name));

	return {
		sourcePath: manager.getConfigPaths().project,
		servers,
	};
}
