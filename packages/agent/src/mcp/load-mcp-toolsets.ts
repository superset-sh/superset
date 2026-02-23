import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MCPClient } from "@mastra/mcp";

interface LoadMcpToolsetsOptions {
	cwd: string;
	apiUrl?: string;
	authHeaders?: Record<string, string>;
}

type MCPClientConfig = ConstructorParameters<typeof MCPClient>[0];
type MCPServersConfig = NonNullable<MCPClientConfig["servers"]>;
type MCPServerConfig = MCPServersConfig[string];
type LoadedToolsets = Awaited<ReturnType<MCPClient["listToolsets"]>>;

interface ParsedServerBase {
	name: string;
	source: string;
}

interface ParsedRemoteServer extends ParsedServerBase {
	kind: "remote";
	url: string;
	headers?: Record<string, string>;
}

interface ParsedLocalServer extends ParsedServerBase {
	kind: "local";
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

type ParsedServer = ParsedRemoteServer | ParsedLocalServer;

interface ParseResult {
	servers: ParsedServer[];
	errors: string[];
}

export interface LoadedMcpToolsetsResult {
	toolsets?: LoadedToolsets;
	serverNames: string[];
	sources: string[];
	errors: string[];
	disconnect: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter(
		(item): item is string => typeof item === "string",
	);
	return items.length > 0 ? items : undefined;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;
	const output: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string") {
			output[key] = item;
		}
	}
	return Object.keys(output).length > 0 ? output : undefined;
}

function readJsonFile(filePath: string): unknown {
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function parseMcpJsonFile(filePath: string): ParseResult {
	const errors: string[] = [];
	const servers: ParsedServer[] = [];

	try {
		const parsed = readJsonFile(filePath);
		if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
			return { servers, errors };
		}

		for (const [name, rawConfig] of Object.entries(parsed.mcpServers)) {
			if (!isRecord(rawConfig)) continue;

			const type =
				typeof rawConfig.type === "string"
					? rawConfig.type.toLowerCase()
					: null;
			const url = typeof rawConfig.url === "string" ? rawConfig.url : null;
			const command =
				typeof rawConfig.command === "string" ? rawConfig.command : null;
			const args = parseStringArray(rawConfig.args);
			const env = parseStringRecord(rawConfig.env);
			const headers = parseStringRecord(rawConfig.headers);

			if ((type === "http" || url) && url) {
				servers.push({
					kind: "remote",
					name,
					source: filePath,
					url,
					...(headers ? { headers } : {}),
				});
				continue;
			}

			if (command) {
				servers.push({
					kind: "local",
					name,
					source: filePath,
					command,
					...(args ? { args } : {}),
					...(env ? { env } : {}),
				});
			}
		}
	} catch (error) {
		errors.push(
			`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return { servers, errors };
}

function parseOpenCodeFile(filePath: string): ParseResult {
	const errors: string[] = [];
	const servers: ParsedServer[] = [];

	try {
		const parsed = readJsonFile(filePath);
		if (!isRecord(parsed) || !isRecord(parsed.mcp)) {
			return { servers, errors };
		}

		for (const [name, rawConfig] of Object.entries(parsed.mcp)) {
			if (!isRecord(rawConfig)) continue;

			const type =
				typeof rawConfig.type === "string"
					? rawConfig.type.toLowerCase()
					: null;
			const url = typeof rawConfig.url === "string" ? rawConfig.url : null;
			const commandArray = parseStringArray(rawConfig.command);
			const command =
				commandArray && commandArray.length > 0 ? commandArray[0] : null;
			const args =
				commandArray && commandArray.length > 1
					? commandArray.slice(1)
					: undefined;
			const env = parseStringRecord(rawConfig.env);

			if (type === "remote" && url) {
				servers.push({
					kind: "remote",
					name,
					source: filePath,
					url,
				});
				continue;
			}

			if (type === "local" && command) {
				servers.push({
					kind: "local",
					name,
					source: filePath,
					command,
					...(args ? { args } : {}),
					...(env ? { env } : {}),
				});
			}
		}
	} catch (error) {
		errors.push(
			`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return { servers, errors };
}

interface CodexServerDraft {
	url?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	httpHeaders?: Record<string, string>;
	bearerTokenEnvVar?: string;
}

function stripTomlComment(line: string): string {
	const hashIndex = line.indexOf("#");
	if (hashIndex < 0) return line;

	let inDoubleQuotes = false;
	let inSingleQuotes = false;
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (char === '"' && !inSingleQuotes && line[i - 1] !== "\\") {
			inDoubleQuotes = !inDoubleQuotes;
		}
		if (char === "'" && !inDoubleQuotes) {
			inSingleQuotes = !inSingleQuotes;
		}
		if (char === "#" && !inDoubleQuotes && !inSingleQuotes) {
			return line.slice(0, i);
		}
	}
	return line;
}

function unescapeDoubleQuoted(value: string): string {
	return value
		.replaceAll("\\\\", "\u0000")
		.replaceAll('\\"', '"')
		.replaceAll("\\n", "\n")
		.replaceAll("\\t", "\t")
		.replaceAll("\\r", "\r")
		.replaceAll("\u0000", "\\");
}

function parseTomlString(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length < 2) return undefined;

	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return unescapeDoubleQuoted(trimmed.slice(1, -1));
	}

	if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1);
	}

	return undefined;
}

function parseTomlStringArray(value: string): string[] | undefined {
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
		return undefined;
	}

	const items: string[] = [];
	const content = trimmed.slice(1, -1);
	const matcher = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
	let match = matcher.exec(content);
	while (match) {
		const doubleQuoted = match[1];
		const singleQuoted = match[2];
		if (doubleQuoted !== undefined) {
			items.push(unescapeDoubleQuoted(doubleQuoted));
		} else if (singleQuoted !== undefined) {
			items.push(singleQuoted);
		}
		match = matcher.exec(content);
	}

	return items.length > 0 ? items : undefined;
}

function parseTomlInlineTable(
	value: string,
): Record<string, string> | undefined {
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
		return undefined;
	}

	const output: Record<string, string> = {};
	const content = trimmed.slice(1, -1);
	const matcher =
		/([A-Za-z0-9._-]+)\s*=\s*("((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;

	let match = matcher.exec(content);
	while (match) {
		const key = match[1];
		const doubleQuoted = match[3];
		const singleQuoted = match[4];
		if (!key) {
			match = matcher.exec(content);
			continue;
		}
		if (doubleQuoted !== undefined) {
			output[key] = unescapeDoubleQuoted(doubleQuoted);
		} else if (singleQuoted !== undefined) {
			output[key] = singleQuoted;
		}
		match = matcher.exec(content);
	}

	return Object.keys(output).length > 0 ? output : undefined;
}

function parseSectionServerName(rawValue: string): string | undefined {
	const trimmed = rawValue.trim();
	const quoted = parseTomlString(trimmed);
	return quoted ?? trimmed;
}

function parseCodexTomlFile(filePath: string): ParseResult {
	const errors: string[] = [];
	const drafts = new Map<string, CodexServerDraft>();

	try {
		const content = fs.readFileSync(filePath, "utf-8");
		let currentServerName: string | null = null;

		for (const rawLine of content.split(/\r?\n/)) {
			const noComment = stripTomlComment(rawLine).trim();
			if (noComment.length === 0) continue;

			const sectionMatch = noComment.match(/^\[mcp_servers\.(.+)\]$/);
			if (sectionMatch) {
				const sectionName = sectionMatch[1];
				if (!sectionName) {
					currentServerName = null;
					continue;
				}
				const parsedName = parseSectionServerName(sectionName);
				if (!parsedName) {
					currentServerName = null;
					continue;
				}
				currentServerName = parsedName;
				if (!drafts.has(parsedName)) {
					drafts.set(parsedName, {});
				}
				continue;
			}

			if (!currentServerName) continue;
			const assignmentMatch = noComment.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
			if (!assignmentMatch) continue;

			const key = assignmentMatch[1];
			const rawValue = assignmentMatch[2];
			if (!key || !rawValue) continue;
			const draft = drafts.get(currentServerName);
			if (!draft) continue;

			if (key === "url") {
				const value = parseTomlString(rawValue);
				if (value) draft.url = value;
				continue;
			}

			if (key === "command") {
				const value = parseTomlString(rawValue);
				if (value) draft.command = value;
				continue;
			}

			if (key === "args") {
				const value = parseTomlStringArray(rawValue);
				if (value) draft.args = value;
				continue;
			}

			if (key === "env") {
				const value = parseTomlInlineTable(rawValue);
				if (value) draft.env = value;
				continue;
			}

			if (key === "http_headers") {
				const value = parseTomlInlineTable(rawValue);
				if (value) draft.httpHeaders = value;
				continue;
			}

			if (key === "bearer_token_env_var") {
				const value = parseTomlString(rawValue);
				if (value) draft.bearerTokenEnvVar = value;
			}
		}
	} catch (error) {
		errors.push(
			`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const servers: ParsedServer[] = [];
	for (const [name, draft] of drafts) {
		if (draft.url) {
			const headers: Record<string, string> = { ...(draft.httpHeaders || {}) };
			if (draft.bearerTokenEnvVar) {
				const token = process.env[draft.bearerTokenEnvVar];
				if (token) {
					headers.Authorization = `Bearer ${token}`;
				}
			}
			servers.push({
				kind: "remote",
				name,
				source: filePath,
				url: draft.url,
				...(Object.keys(headers).length > 0 ? { headers } : {}),
			});
			continue;
		}

		if (draft.command) {
			servers.push({
				kind: "local",
				name,
				source: filePath,
				command: draft.command,
				...(draft.args ? { args: draft.args } : {}),
				...(draft.env ? { env: draft.env } : {}),
			});
		}
	}

	return { servers, errors };
}

function findNearestUpwards(
	startDir: string,
	relativePath: string,
): string | undefined {
	let current = path.resolve(startDir);
	while (true) {
		const candidate = path.join(current, relativePath);
		if (fs.existsSync(candidate)) {
			return candidate;
		}

		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function hasHeader(
	headers: Record<string, string>,
	headerName: string,
): boolean {
	const target = headerName.toLowerCase();
	return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function isCommandAvailable(command: string): boolean {
	const checker = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(checker, [command], { stdio: "ignore" });
	return result.status === 0;
}

function shouldAttachSupersetAuthHeaders(
	url: string,
	apiUrl?: string,
): boolean {
	try {
		const parsed = new URL(url);
		const isLikelySupersetMcp = parsed.pathname.includes("/api/agent/mcp");
		if (!isLikelySupersetMcp) return false;
		if (parsed.hostname === "api.superset.sh") return true;

		if (!apiUrl) {
			return false;
		}

		const parsedApiUrl = new URL(apiUrl);
		return parsed.origin === parsedApiUrl.origin;
	} catch {
		return false;
	}
}

function toMcpServerConfig(server: ParsedServer): MCPServerConfig | undefined {
	if (server.kind === "local") {
		return {
			command: server.command,
			...(server.args ? { args: server.args } : {}),
			...(server.env ? { env: server.env } : {}),
		} as MCPServerConfig;
	}

	try {
		const parsedUrl = new URL(server.url);
		return {
			url: parsedUrl,
			...(server.headers
				? {
						requestInit: {
							headers: server.headers,
						},
					}
				: {}),
		} as MCPServerConfig;
	} catch {
		return undefined;
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function extractEndpointErrorDescription(message: string): string | null {
	const jsonMatch = message.match(
		/\{[^{}]*"error_description"\s*:\s*"([^"]+)"[^{}]*\}/,
	);
	if (!jsonMatch?.[1]) return null;
	return jsonMatch[1].trim();
}

function isAuthRelatedError(text: string): boolean {
	return /invalid[_\s-]?token|missing authorization|no authorization|access token|unauthorized|forbidden/i.test(
		text,
	);
}

function sanitizeConnectionErrorMessage(error: unknown): string {
	const rawMessage = getErrorMessage(error).trim();
	if (!rawMessage) return "Unknown connection error";

	const endpointDescription = extractEndpointErrorDescription(rawMessage);
	if (endpointDescription) {
		if (isAuthRelatedError(endpointDescription)) {
			return "Authentication required";
		}
		return endpointDescription;
	}

	// Drop stack frames and transport internals; keep first human-meaningful line.
	const firstLine = rawMessage.split(/\r?\n/)[0]?.trim() ?? rawMessage;
	const noStackSuffix = firstLine
		.replace(/\s+at\s+[A-Za-z0-9_$.[\]<>()]+\s*\([^)]*\)\s*$/g, "")
		.replace(/^Error:\s*/i, "")
		.trim();

	if (isAuthRelatedError(noStackSuffix)) {
		return "Authentication required";
	}

	return noStackSuffix || "Unknown connection error";
}

export async function loadMcpToolsetsForChat(
	options: LoadMcpToolsetsOptions,
): Promise<LoadedMcpToolsetsResult> {
	const { cwd, authHeaders, apiUrl } = options;
	const errors: string[] = [];

	const mcpJsonPath = findNearestUpwards(cwd, ".mcp.json");
	const codexPath = findNearestUpwards(cwd, path.join(".codex", "config.toml"));
	const opencodePath = findNearestUpwards(cwd, "opencode.json");

	const sources = [mcpJsonPath, codexPath, opencodePath].filter(
		(filePath): filePath is string => Boolean(filePath),
	);

	const parseResults: ParseResult[] = [];
	if (mcpJsonPath) parseResults.push(parseMcpJsonFile(mcpJsonPath));
	if (codexPath) parseResults.push(parseCodexTomlFile(codexPath));
	if (opencodePath) parseResults.push(parseOpenCodeFile(opencodePath));

	for (const result of parseResults) {
		errors.push(...result.errors);
	}

	const mergedServers = new Map<string, ParsedServer>();
	for (const result of parseResults) {
		for (const server of result.servers) {
			let resolvedServer = server;
			if (
				server.kind === "remote" &&
				authHeaders &&
				Object.keys(authHeaders).length > 0 &&
				shouldAttachSupersetAuthHeaders(server.url, apiUrl)
			) {
				const headers = { ...(server.headers || {}) };
				for (const [key, value] of Object.entries(authHeaders)) {
					if (!hasHeader(headers, key)) {
						headers[key] = value;
					}
				}
				resolvedServer = {
					...server,
					headers,
				};
			}
			mergedServers.set(resolvedServer.name, resolvedServer);
		}
	}

	const serverEntries: Array<[string, MCPServerConfig]> = [];
	for (const server of mergedServers.values()) {
		if (server.kind === "local" && !isCommandAvailable(server.command)) {
			errors.push(
				`Skipping MCP server "${server.name}" from ${server.source}: command "${server.command}" not found in PATH`,
			);
			continue;
		}

		const config = toMcpServerConfig(server);
		if (!config) {
			errors.push(
				`Skipping MCP server "${server.name}" from ${server.source}: invalid configuration`,
			);
			continue;
		}
		serverEntries.push([server.name, config]);
	}

	if (serverEntries.length === 0) {
		return {
			sources,
			errors,
			serverNames: [],
			disconnect: async () => {},
		};
	}

	const clients: MCPClient[] = [];
	let mergedToolsets: LoadedToolsets | undefined;
	const connectedServerNames: string[] = [];

	for (const [name, config] of serverEntries) {
		try {
			const servers = { [name]: config } as MCPServersConfig;
			const client = new MCPClient({ servers });
			const toolsets = await client.listToolsets();
			mergedToolsets = mergedToolsets
				? { ...mergedToolsets, ...toolsets }
				: toolsets;
			clients.push(client);
			connectedServerNames.push(name);
		} catch (error) {
			errors.push(
				`Failed to connect MCP server "${name}": ${sanitizeConnectionErrorMessage(error)}`,
			);
		}
	}

	return {
		toolsets: mergedToolsets,
		serverNames: connectedServerNames,
		sources,
		errors,
		disconnect: async () => {
			if (clients.length === 0) return;
			await Promise.allSettled(clients.map((client) => client.disconnect()));
		},
	};
}
