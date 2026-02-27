import type { RuntimeSession } from "../../runtime";

type McpServerTransport = "remote" | "local" | "unknown";

type McpServerState = "enabled" | "disabled" | "invalid";

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

function resolveTransport(config: Record<string, unknown>): McpServerTransport {
	const type = toNonEmptyString(config.type)?.toLowerCase();
	const url = toNonEmptyString(config.url);
	const httpUrl = toNonEmptyString(config.httpUrl);
	const command = toNonEmptyString(config.command)?.toLowerCase();
	const commandParts = toStringArray(config.command) ?? [];
	const args = toStringArray(config.args) ?? [];

	const hasRemoteUrl = args.some((arg) => /^https?:\/\//i.test(arg));
	const isMcpRemote =
		command === "mcp-remote" ||
		commandParts.some((arg) => arg.toLowerCase() === "mcp-remote") ||
		args.some((arg) => arg.toLowerCase() === "mcp-remote");

	if (url || httpUrl || type === "http" || type === "remote") {
		return "remote";
	}
	if (hasRemoteUrl || isMcpRemote) {
		return "remote";
	}
	if (
		command ||
		commandParts.length > 0 ||
		type === "local" ||
		type === "stdio"
	) {
		return "local";
	}
	return "unknown";
}

function resolveTarget(
	config: Record<string, unknown>,
	transport: McpServerTransport,
): string {
	if (transport === "remote") {
		const url = toNonEmptyString(config.url);
		if (url) {
			return url;
		}
		const httpUrl = toNonEmptyString(config.httpUrl);
		if (httpUrl) {
			return httpUrl;
		}
		const args = toStringArray(config.args) ?? [];
		const remoteUrl = args.find((arg) => /^https?:\/\//i.test(arg));
		if (remoteUrl) {
			return remoteUrl;
		}
		return "Not configured";
	}

	const command = toNonEmptyString(config.command);
	const commandParts = toStringArray(config.command);
	const args = toStringArray(config.args) ?? [];
	if (command) {
		return [command, ...args].join(" ");
	}
	if (commandParts) {
		return commandParts.join(" ");
	}
	return "Not configured";
}

function resolveState(
	config: Record<string, unknown>,
	transport: McpServerTransport,
): McpServerState {
	if (config.disabled === true || config.enabled === false) {
		return "disabled";
	}
	if (transport === "unknown") {
		return "invalid";
	}
	return "enabled";
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
			return {
				name,
				state: resolveState(normalizedConfig, transport),
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
