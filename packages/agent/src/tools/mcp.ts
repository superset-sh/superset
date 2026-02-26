import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolsInput } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { type MastraMCPServerDefinition, MCPClient } from "@mastra/mcp";

const MCP_SETTINGS_FILE = ".mcp.json";
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;

interface CachedMcpServerTools {
	client: MCPClient;
	tools: ToolsInput;
	lastUsedAt: number;
}

type HeaderMap = Record<string, string>;

const mcpServerToolsCache = new Map<string, CachedMcpServerTools>();
const mcpServerToolsInFlight = new Map<string, Promise<CachedMcpServerTools>>();
let cleanupRegistered = false;

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

function parseAuthHeaders(value: unknown): HeaderMap {
	const raw = toNonEmptyString(value);
	if (!raw) return {};
	try {
		return toStringMap(JSON.parse(raw)) ?? {};
	} catch {
		return {};
	}
}

function toAbsoluteUrl(value: string, apiUrl: string | null): URL | null {
	try {
		return apiUrl ? new URL(value, apiUrl) : new URL(value);
	} catch {
		return null;
	}
}

function normalizeServerConfig(input: {
	config: Record<string, unknown>;
	apiUrl: string | null;
	authHeaders: HeaderMap;
}): MastraMCPServerDefinition | null {
	const { config, apiUrl, authHeaders } = input;

	if (config.disabled === true || config.enabled === false) {
		return null;
	}

	const commandValue = config.command;
	const command = toNonEmptyString(commandValue);
	const commandParts = toStringArray(commandValue);
	const args = toStringArray(config.args) ?? [];
	const env = toStringMap(config.env) ?? undefined;

	if (command) {
		return {
			command,
			...(args.length > 0 ? { args } : {}),
			...(env ? { env } : {}),
		};
	}

	if (commandParts && commandParts.length > 0) {
		const [first, ...rest] = commandParts;
		if (!first) return null;
		return {
			command: first,
			...(rest.length > 0 || args.length > 0
				? { args: [...rest, ...args] }
				: {}),
			...(env ? { env } : {}),
		};
	}

	const urlText = toNonEmptyString(config.url);
	if (!urlText) return null;

	const url = toAbsoluteUrl(urlText, apiUrl);
	if (!url) return null;

	if (
		!shouldForwardAuthHeaders(url, apiUrl) ||
		Object.keys(authHeaders).length === 0
	) {
		return { url };
	}

	return {
		url,
		fetch: async (resource, init) => {
			const headers = new Headers(init?.headers);
			for (const [headerName, headerValue] of Object.entries(authHeaders)) {
				headers.set(headerName, headerValue);
			}
			return globalThis.fetch(resource, { ...init, headers });
		},
	};
}

function shouldForwardAuthHeaders(
	serverUrl: URL,
	apiUrl: string | null,
): boolean {
	if (!apiUrl) return false;
	try {
		const api = new URL(apiUrl);
		return (
			serverUrl.origin === api.origin &&
			serverUrl.pathname.startsWith("/api/agent/")
		);
	} catch {
		return false;
	}
}

function readWorkspaceMcpServers(input: {
	cwd: string;
	apiUrl: string | null;
	authHeaders: HeaderMap;
}): Record<string, MastraMCPServerDefinition> {
	const sourcePath = join(input.cwd, MCP_SETTINGS_FILE);
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

	const normalized: Record<string, MastraMCPServerDefinition> = {};
	for (const [name, rawConfig] of Object.entries(rawServers)) {
		const config = toRecord(rawConfig);
		if (!config) continue;
		const normalizedConfig = normalizeServerConfig({
			config,
			apiUrl: input.apiUrl,
			authHeaders: input.authHeaders,
		});
		if (normalizedConfig) {
			normalized[name] = normalizedConfig;
		}
	}

	return normalized;
}

function injectSupersetServer(input: {
	servers: Record<string, MastraMCPServerDefinition>;
	apiUrl: string | null;
	authHeaders: HeaderMap;
}): void {
	if (input.servers.superset) return;
	if (!input.apiUrl) return;

	const url = toAbsoluteUrl("/api/agent/mcp", input.apiUrl);
	if (!url) return;

	input.servers.superset = {
		url,
		fetch: async (resource, init) => {
			const headers = new Headers(init?.headers);
			for (const [headerName, headerValue] of Object.entries(
				input.authHeaders,
			)) {
				headers.set(headerName, headerValue);
			}
			return globalThis.fetch(resource, { ...init, headers });
		},
	};
}

function hashText(value: string): string {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function getServerCacheKey(input: {
	serverName: string;
	serverConfig: MastraMCPServerDefinition;
	authHeader: string | null;
}): string {
	const { serverName, serverConfig, authHeader } = input;
	const signature =
		"command" in serverConfig
			? JSON.stringify({
					serverName,
					command: serverConfig.command,
					args: serverConfig.args ?? [],
					env: serverConfig.env ?? {},
				})
			: JSON.stringify({
					serverName,
					url: serverConfig.url.toString(),
					withAuth:
						Boolean(authHeader) &&
						serverConfig.url.pathname.startsWith("/api/agent/"),
				});

	return `${serverName}:${hashText(signature)}:${hashText(authHeader ?? "")}`;
}

async function disconnectClient(key: string): Promise<void> {
	const cached = mcpServerToolsCache.get(key);
	if (!cached) return;
	mcpServerToolsCache.delete(key);
	try {
		await cached.client.disconnect();
	} catch {
		// Best-effort cleanup.
	}
}

function cleanupMcpServerCache(): void {
	const now = Date.now();

	for (const [key, cached] of mcpServerToolsCache) {
		if (now - cached.lastUsedAt <= CACHE_TTL_MS) continue;
		void disconnectClient(key);
	}

	if (mcpServerToolsCache.size <= MAX_CACHE_ENTRIES) return;

	const sorted = [...mcpServerToolsCache.entries()].sort(
		(left, right) => left[1].lastUsedAt - right[1].lastUsedAt,
	);
	const overflowCount = mcpServerToolsCache.size - MAX_CACHE_ENTRIES;
	for (let index = 0; index < overflowCount; index += 1) {
		const staleKey = sorted[index]?.[0];
		if (!staleKey) continue;
		void disconnectClient(staleKey);
	}
}

function registerCleanupHandlers(): void {
	if (cleanupRegistered || typeof process === "undefined") return;
	cleanupRegistered = true;

	const handler = () => {
		for (const [key, cached] of mcpServerToolsCache) {
			mcpServerToolsCache.delete(key);
			void cached.client.disconnect();
		}
		mcpServerToolsInFlight.clear();
	};

	process.once("exit", handler);
	process.once("SIGINT", handler);
	process.once("SIGTERM", handler);
}

async function getOrCreateServerTools(input: {
	cacheKey: string;
	serverName: string;
	serverConfig: MastraMCPServerDefinition;
}): Promise<CachedMcpServerTools> {
	const existing = mcpServerToolsCache.get(input.cacheKey);
	if (existing) {
		existing.lastUsedAt = Date.now();
		return existing;
	}

	const pending = mcpServerToolsInFlight.get(input.cacheKey);
	if (pending) {
		const resolved = await pending;
		resolved.lastUsedAt = Date.now();
		return resolved;
	}

	const initPromise = (async () => {
		const client = new MCPClient({
			id: `superset-agent-${hashText(input.cacheKey)}`,
			servers: {
				[input.serverName]: input.serverConfig,
			},
		});
		const tools = (await client.listTools()) as ToolsInput;
		const cached: CachedMcpServerTools = {
			client,
			tools,
			lastUsedAt: Date.now(),
		};
		mcpServerToolsCache.set(input.cacheKey, cached);
		return cached;
	})();

	mcpServerToolsInFlight.set(input.cacheKey, initPromise);

	try {
		return await initPromise;
	} finally {
		mcpServerToolsInFlight.delete(input.cacheKey);
	}
}

export async function getMcpTools({
	requestContext,
}: {
	requestContext: RequestContext;
}): Promise<ToolsInput> {
	registerCleanupHandlers();
	cleanupMcpServerCache();

	const cwd = toNonEmptyString(requestContext.get("cwd")) ?? process.cwd();
	const apiUrl = toNonEmptyString(requestContext.get("apiUrl"));
	const rawAuthHeaders = parseAuthHeaders(requestContext.get("authHeaders"));
	const authToken = toNonEmptyString(requestContext.get("authToken"));
	const authHeaders: HeaderMap = {
		...rawAuthHeaders,
	};
	if (!authHeaders.Authorization && authToken) {
		authHeaders.Authorization = `Bearer ${authToken}`;
	}

	const servers = readWorkspaceMcpServers({ cwd, apiUrl, authHeaders });
	injectSupersetServer({ servers, apiUrl, authHeaders });

	const allTools: ToolsInput = {};
	const authorization = authHeaders.Authorization ?? null;

	for (const [serverName, serverConfig] of Object.entries(servers)) {
		const cacheKey = getServerCacheKey({
			serverName,
			serverConfig,
			authHeader: authorization,
		});
		try {
			const cached = await getOrCreateServerTools({
				cacheKey,
				serverName,
				serverConfig,
			});
			Object.assign(allTools, cached.tools);
		} catch (error) {
			console.warn(
				`[mcp-tools] Failed to initialize MCP server "${serverName}":`,
				error,
			);
		}
	}

	return allTools;
}
