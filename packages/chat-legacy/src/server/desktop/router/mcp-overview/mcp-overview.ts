import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const mcpSettingsSchema = z.object({
	mcpServers: z.record(z.string(), z.unknown()),
});

const ampMcpSettingsSchema = z.object({
	"amp.mcpServers": z.record(z.string(), z.unknown()),
});

const MCP_SETTINGS_FILES = [
	{
		relativePath: ".mastracode/mcp.json",
		readServers: (parsed: unknown) => {
			const result = mcpSettingsSchema.safeParse(parsed);
			return result.success ? result.data.mcpServers : null;
		},
	},
	{
		relativePath: ".mcp.json",
		readServers: (parsed: unknown) => {
			const result = mcpSettingsSchema.safeParse(parsed);
			return result.success ? result.data.mcpServers : null;
		},
	},
	{
		relativePath: ".amp/settings.json",
		readServers: (parsed: unknown) => {
			const result = ampMcpSettingsSchema.safeParse(parsed);
			return result.success ? result.data["amp.mcpServers"] : null;
		},
	},
] as const;

export type McpServerState = "enabled" | "disabled" | "invalid";
export type McpServerTransport = "remote" | "local" | "unknown";

export interface McpServerOverview {
	name: string;
	state: McpServerState;
	transport: McpServerTransport;
	target: string;
}

export interface McpOverview {
	sourcePath: string | null;
	servers: McpServerOverview[];
}

function resolveMcpServers(cwd: string): {
	sourcePath: string | null;
	servers: Record<string, unknown>;
} {
	let firstExistingPath: string | null = null;

	for (const { relativePath, readServers } of MCP_SETTINGS_FILES) {
		const sourcePath = join(cwd, relativePath);
		if (!existsSync(sourcePath)) {
			continue;
		}

		if (!firstExistingPath) {
			firstExistingPath = sourcePath;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(sourcePath, "utf-8"));
		} catch {
			continue;
		}

		const servers = readServers(parsed);
		if (!servers) {
			continue;
		}

		return {
			sourcePath,
			servers,
		};
	}

	return { sourcePath: firstExistingPath, servers: {} };
}

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
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

function resolveTransport(config: Record<string, unknown>): McpServerTransport {
	const type = toNonEmptyString(config.type)?.toLowerCase();
	const url = toNonEmptyString(config.url);
	const command = toNonEmptyString(config.command);
	const commandParts = toStringArray(config.command);

	if (url || type === "http" || type === "remote") return "remote";
	if (command || commandParts || type === "local" || type === "stdio") {
		return "local";
	}
	return "unknown";
}

function resolveTarget(
	config: Record<string, unknown>,
	transport: McpServerTransport,
): string {
	if (transport === "remote") {
		return toNonEmptyString(config.url) ?? "Not configured";
	}

	if (transport === "local") {
		const command = toNonEmptyString(config.command);
		const commandParts = toStringArray(config.command);
		const args = toStringArray(config.args) ?? [];

		if (command) {
			return [command, ...args].join(" ");
		}
		if (commandParts) {
			return commandParts.join(" ");
		}
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

export function getMcpOverview(cwd: string): McpOverview {
	const { sourcePath, servers: mcpServers } = resolveMcpServers(cwd);
	if (!sourcePath) {
		return { sourcePath: null, servers: [] };
	}

	const servers = Object.entries(mcpServers)
		.map(([name, rawConfig]) => {
			const config = toRecord(rawConfig) ?? {};
			const transport = resolveTransport(config);
			return {
				name,
				transport,
				target: resolveTarget(config, transport),
				state: resolveState(config, transport),
			} satisfies McpServerOverview;
		})
		.sort((left, right) => left.name.localeCompare(right.name));

	return { sourcePath, servers };
}
