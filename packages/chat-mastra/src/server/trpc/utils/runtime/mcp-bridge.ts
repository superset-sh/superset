import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const WORKSPACE_MCP_FILE = ".mcp.json";
const MASTRA_MCP_FILE = ".mastracode/mcp.json";
const GENERATED_BY = "superset-chat-mastra-mcp-bridge-v1";
const SUPERSET_AUTH_TOKEN_ENV = "SUPERSET_MCP_AUTH_TOKEN";

interface MastraCodeMcpServer {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

interface MastraCodeMcpConfig {
	generatedBy: string;
	generatedAt: string;
	sourcePath: string;
	mcpServers: Record<string, MastraCodeMcpServer>;
}

type HeaderMap = Record<string, string>;

type RemoteBridgeCommand =
	| { command: "bunx"; argsPrefix: string[] }
	| { command: "npx"; argsPrefix: string[] }
	| null;

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
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

function toStringMap(value: unknown): Record<string, string> | null {
	const record = toRecord(value);
	if (!record) return null;
	const entries = Object.entries(record)
		.filter(([, item]) => typeof item === "string")
		.map(([key, item]) => [key, item as string]);
	if (entries.length === 0) return null;
	return Object.fromEntries(entries);
}

function commandExists(command: string): boolean {
	const result = spawnSync(command, ["--version"], {
		stdio: "ignore",
	});
	return result.status === 0;
}

function resolveRemoteBridgeCommand(): RemoteBridgeCommand {
	if (commandExists("bunx")) {
		return { command: "bunx", argsPrefix: ["mcp-remote"] };
	}
	if (commandExists("npx")) {
		return { command: "npx", argsPrefix: ["-y", "mcp-remote"] };
	}
	return null;
}

function readGeneratedFlag(path: string): boolean {
	if (!existsSync(path)) return false;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
			generatedBy?: unknown;
		};
		return parsed.generatedBy === GENERATED_BY;
	} catch {
		return false;
	}
}

function isSupersetServer(name: string, url: string): boolean {
	if (name === "superset") return true;
	try {
		const parsed = new URL(url);
		return parsed.pathname.includes("/api/agent/mcp");
	} catch {
		return false;
	}
}

function serverHeadersFromConfig(config: Record<string, unknown>): HeaderMap {
	const directHeaders = toStringMap(config.headers);
	if (directHeaders) return directHeaders;

	const transportHeaders = toStringMap(config.requestHeaders);
	if (transportHeaders) return transportHeaders;

	return {};
}

function toMastraCodeServer(input: {
	name: string;
	config: Record<string, unknown>;
	bridgeCommand: RemoteBridgeCommand;
}): MastraCodeMcpServer | null {
	const { name, config, bridgeCommand } = input;

	if (config.disabled === true || config.enabled === false) {
		return null;
	}

	const command = toNonEmptyString(config.command);
	if (command) {
		const args = toStringArray(config.args) ?? undefined;
		const env = toStringMap(config.env) ?? undefined;
		return {
			command,
			...(args ? { args } : {}),
			...(env ? { env } : {}),
		};
	}

	const url = toNonEmptyString(config.url);
	if (!url || !bridgeCommand) return null;

	const headers = serverHeadersFromConfig(config);
	if (
		isSupersetServer(name, url) &&
		!headers.Authorization &&
		process.env[SUPERSET_AUTH_TOKEN_ENV]
	) {
		headers.Authorization = `Bearer \${${SUPERSET_AUTH_TOKEN_ENV}}`;
	}

	const args = [...bridgeCommand.argsPrefix, url];
	for (const [headerKey, headerValue] of Object.entries(headers)) {
		args.push("--header", `${headerKey}: ${headerValue}`);
	}

	return {
		command: bridgeCommand.command,
		args,
	};
}

function readWorkspaceMcpServers(
	cwd: string,
): Record<string, MastraCodeMcpServer> {
	const sourcePath = join(cwd, WORKSPACE_MCP_FILE);
	if (!existsSync(sourcePath)) return {};

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(sourcePath, "utf-8"));
	} catch {
		return {};
	}

	const root = toRecord(parsed);
	const rawServers = toRecord(root?.mcpServers);
	if (!rawServers) return {};

	const bridgeCommand = resolveRemoteBridgeCommand();
	if (!bridgeCommand) {
		console.warn(
			"[chat-mastra] MCP bridge: neither bunx nor npx found; HTTP MCP servers will be skipped",
		);
	}

	const result: Record<string, MastraCodeMcpServer> = {};
	for (const [name, rawConfig] of Object.entries(rawServers)) {
		const config = toRecord(rawConfig);
		if (!config) continue;
		const server = toMastraCodeServer({ name, config, bridgeCommand });
		if (!server) continue;
		result[name] = server;
	}

	return result;
}

function cleanupGeneratedFile(path: string): void {
	try {
		rmSync(path, { force: true });
	} catch {}

	const parent = dirname(path);
	try {
		rmdirSync(parent);
	} catch {}
}

export function ensureMastraCodeMcpBridge(input: {
	cwd: string;
	authToken?: string;
}): void {
	if (input.authToken) {
		process.env[SUPERSET_AUTH_TOKEN_ENV] = input.authToken;
	}

	const targetPath = join(input.cwd, MASTRA_MCP_FILE);
	const hasManagedFile = readGeneratedFlag(targetPath);
	if (existsSync(targetPath) && !hasManagedFile) {
		return;
	}

	const servers = readWorkspaceMcpServers(input.cwd);
	if (Object.keys(servers).length === 0) {
		if (hasManagedFile) {
			cleanupGeneratedFile(targetPath);
		}
		return;
	}

	const sourcePath = join(input.cwd, WORKSPACE_MCP_FILE);
	const payload: MastraCodeMcpConfig = {
		generatedBy: GENERATED_BY,
		generatedAt: new Date().toISOString(),
		sourcePath,
		mcpServers: servers,
	};

	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
