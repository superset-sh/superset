import { readFile, stat } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { readEnabledPlugins } from "@superset/agent-setup";
import type {
	McpServerAgent,
	McpServerEntry,
	McpServerPlugin,
	McpServerScope,
} from "@superset/shared/mcp-servers";
import {
	DEFAULT_MARKETPLACE,
	desiredPluginMcpServers,
	isServerSatisfiedExternally,
	PLUGIN_CATALOG,
	type PluginMcpServerConfig,
	SUPERSET_API_URL,
} from "@superset/shared/plugins";

export interface McpConfigPaths {
	homeDir: string;
	/** `~/.claude.json`, or `.claude.json` inside a custom CLAUDE_CONFIG_DIR. */
	claudeStatePath: string;
	codexConfigPath: string;
	installedPluginsPath: string;
}

export interface DiscoverMcpServersOptions {
	worktreePath: string;
	agent: string;
	paths: McpConfigPaths;
}

interface FoundServer {
	name: string;
	agent: McpServerAgent;
	scope: McpServerScope;
	transport: string;
	enabled: boolean;
	configPath: string;
	url?: string;
	command?: string;
	args?: string[];
	untrusted?: boolean;
}

const MAX_CONFIG_BYTES = 50 * 1024 * 1024;
const PROXY_PREFIX = `${SUPERSET_API_URL}/mcp/plugins/`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

async function readText(path: string): Promise<string | null> {
	try {
		if ((await stat(path)).size > MAX_CONFIG_BYTES) return null;
		return await readFile(path, "utf-8");
	} catch {
		return null;
	}
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
	const raw = await readText(path);
	if (raw === null) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function projectDirs(
	worktreePath: string,
	homeDir: string,
): Promise<string[]> {
	const dirs: string[] = [];
	let dir = worktreePath;
	while (dir !== homeDir) {
		dirs.push(dir);
		if (await exists(join(dir, ".git"))) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dirs;
}

function nearestPerName(): (servers: FoundServer[]) => FoundServer[] {
	const seen = new Set<string>();
	return (servers) =>
		servers.filter((server) => {
			if (seen.has(server.name)) return false;
			seen.add(server.name);
			return true;
		});
}

function jsonServers(
	servers: unknown,
	scope: McpServerScope,
	configPath: string,
	disabledNames: readonly string[],
): FoundServer[] {
	if (!isRecord(servers)) return [];
	return Object.entries(servers).flatMap(([name, config]): FoundServer[] => {
		if (!isRecord(config)) return [];
		const url = typeof config.url === "string" ? config.url : undefined;
		return [
			{
				name,
				agent: "claude",
				scope,
				transport:
					typeof config.type === "string"
						? config.type
						: url
							? "http"
							: "stdio",
				enabled:
					config.enabled !== false &&
					config.disabled !== true &&
					!disabledNames.includes(name),
				configPath,
				...(url ? { url } : {}),
				...(typeof config.command === "string"
					? { command: config.command }
					: {}),
				args: stringList(config.args),
			},
		];
	});
}

async function readClaudeServers(
	worktreePath: string,
	paths: McpConfigPaths,
): Promise<FoundServer[]> {
	const state = await readJson(paths.claudeStatePath);
	const projects = isRecord(state?.projects) ? state.projects : {};
	const project = isRecord(projects[worktreePath])
		? projects[worktreePath]
		: {};
	const disabled = stringList(project.disabledMcpServers);
	const disabledProjectFile = [
		...disabled,
		...stringList(project.disabledMcpjsonServers),
	];
	const found = [
		...jsonServers(state?.mcpServers, "user", paths.claudeStatePath, disabled),
		...jsonServers(
			project.mcpServers,
			"local",
			paths.claudeStatePath,
			disabled,
		),
	];
	const nearest = nearestPerName();
	for (const dir of await projectDirs(worktreePath, paths.homeDir)) {
		const file = join(dir, ".mcp.json");
		const config = await readJson(file);
		found.push(
			...nearest(
				jsonServers(config?.mcpServers, "project", file, disabledProjectFile),
			),
		);
	}
	return found;
}

const TOML_SERVER_TABLE =
	/^\s*\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*(\.[^\]]*)?\]/;

function tomlString(line: string, key: string): string | undefined {
	const match = line.match(
		new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`),
	);
	return match ? (match[1] ?? match[2]) : undefined;
}

export function parseCodexMcpServers(
	content: string,
	scope: McpServerScope,
	configPath: string,
): FoundServer[] {
	const servers = new Map<string, FoundServer>();
	let current: FoundServer | null = null;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			const match = line.match(TOML_SERVER_TABLE);
			const name = match ? (match[1] ?? match[2] ?? match[3]) : undefined;
			if (!name) {
				current = null;
				continue;
			}
			const existing = servers.get(name);
			if (match?.[4]) {
				current = null;
				continue;
			}
			current = existing ?? {
				name,
				agent: "codex",
				scope,
				transport: "stdio",
				enabled: true,
				configPath,
				args: [],
			};
			servers.set(name, current);
			continue;
		}
		if (!current) continue;
		const url = tomlString(line, "url");
		if (url !== undefined) {
			current.url = url;
			current.transport = "http";
		}
		const command = tomlString(line, "command");
		if (command !== undefined) current.command = command;
		if (/^\s*enabled\s*=\s*false\b/.test(line)) current.enabled = false;
		const args = line.match(/^\s*args\s*=\s*\[([^\]]*)\]/)?.[1];
		if (args !== undefined) {
			current.args = [...args.matchAll(/"([^"]*)"|'([^']*)'/g)].map(
				(part) => part[1] ?? part[2] ?? "",
			);
		}
	}
	return [...servers.values()];
}

export function parseCodexTrustedProjects(content: string): Set<string> {
	const trusted = new Set<string>();
	let project: string | null = null;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			const match = line.match(
				/^\s*\[\s*projects\.(?:"([^"]+)"|'([^']+)')\s*\]/,
			);
			project = match ? (match[1] ?? match[2] ?? null) : null;
			continue;
		}
		if (project && tomlString(line, "trust_level") === "trusted") {
			trusted.add(project);
		}
	}
	return trusted;
}

/** Codex trusts a git worktree through the repository it belongs to. */
async function trustRoots(dir: string): Promise<string[]> {
	const gitFile = await readText(join(dir, ".git"));
	const gitDir = gitFile?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
	const mainRepo = gitDir?.split(`${sep}.git${sep}worktrees${sep}`)[0];
	return mainRepo && mainRepo !== gitDir ? [dir, mainRepo] : [dir];
}

async function readCodexServers(
	worktreePath: string,
	paths: McpConfigPaths,
): Promise<FoundServer[]> {
	const found: FoundServer[] = [];
	const user = await readText(paths.codexConfigPath);
	if (user !== null) {
		found.push(...parseCodexMcpServers(user, "user", paths.codexConfigPath));
	}
	const trusted = parseCodexTrustedProjects(user ?? "");
	const nearest = nearestPerName();
	for (const dir of await projectDirs(worktreePath, paths.homeDir)) {
		const file = join(dir, ".codex", "config.toml");
		const content = await readText(file);
		if (content === null) continue;
		const untrusted = !(await trustRoots(dir)).some((root) =>
			trusted.has(root),
		);
		found.push(
			...nearest(parseCodexMcpServers(content, "project", file)).map(
				(server) => (untrusted ? { ...server, untrusted } : server),
			),
		);
	}
	return found;
}

interface PluginServer {
	plugin: string;
	server: string;
	config: PluginMcpServerConfig;
}

function catalogPluginServers(): PluginServer[] {
	return PLUGIN_CATALOG.flatMap((plugin) =>
		Object.entries(desiredPluginMcpServers([{ name: plugin.name }])).map(
			([server, config]) => ({ plugin: plugin.name, server, config }),
		),
	);
}

/**
 * A proxy URL names its plugin in the path. Otherwise exact name first, then
 * endpoint, since two catalog plugins can share a host.
 */
function matchPlugin(
	found: FoundServer,
	pluginServers: readonly PluginServer[],
): PluginServer | undefined {
	if (found.url?.startsWith(PROXY_PREFIX)) {
		const plugin = found.url.slice(PROXY_PREFIX.length).split("/")[1];
		return pluginServers.find((candidate) => candidate.plugin === plugin);
	}
	return (
		pluginServers.find((candidate) => candidate.server === found.name) ??
		pluginServers.find((candidate) =>
			isServerSatisfiedExternally(candidate.server, candidate.config, [
				{
					name: found.name,
					...(found.url ? { url: found.url } : {}),
					...(found.command ? { command: found.command } : {}),
					...(found.args ? { args: found.args } : {}),
				},
			]),
		)
	);
}

function installedPluginNames(path: string): Set<string> {
	return new Set(
		(readEnabledPlugins(path) ?? [])
			.filter(
				(plugin) =>
					!plugin.marketplace || plugin.marketplace === DEFAULT_MARKETPLACE,
			)
			.map((plugin) => plugin.name),
	);
}

function compareEntries(a: McpServerEntry, b: McpServerEntry): number {
	return (
		a.name.localeCompare(b.name) ||
		a.agent.localeCompare(b.agent) ||
		a.scope.localeCompare(b.scope) ||
		a.configPath.localeCompare(b.configPath)
	);
}

/**
 * Every MCP server configured for Claude Code or Codex that applies in this
 * worktree, plus each Superset plugin server the asking agent does not have
 * yet. Reads files only: nothing is started or contacted.
 */
export async function discoverMcpServers({
	worktreePath,
	agent,
	paths,
}: DiscoverMcpServersOptions): Promise<McpServerEntry[]> {
	const [claude, codex] = await Promise.all([
		readClaudeServers(worktreePath, paths),
		readCodexServers(worktreePath, paths),
	]);
	const installed = installedPluginNames(paths.installedPluginsPath);
	const pluginServers = catalogPluginServers();
	const covered = new Set<string>();

	const entries = [...claude, ...codex].map((found): McpServerEntry => {
		const match = matchPlugin(found, pluginServers);
		if (match && found.agent === agent) covered.add(match.server);
		const plugin: McpServerPlugin | null = match
			? {
					name: match.plugin,
					installed: installed.has(match.plugin),
					proxied: Boolean(found.url?.startsWith(PROXY_PREFIX)),
				}
			: null;
		return {
			name: found.name,
			agent: found.agent,
			scope: found.scope,
			transport: found.transport,
			enabled: found.enabled,
			configPath: found.configPath,
			plugin,
			state:
				found.agent !== agent
					? "other-agent"
					: found.untrusted
						? "untrusted"
						: found.enabled
							? "available"
							: "disabled",
		};
	});

	if (agent === "claude" || agent === "codex") {
		for (const candidate of pluginServers) {
			if (covered.has(candidate.server)) continue;
			covered.add(candidate.server);
			entries.push({
				name: candidate.server,
				agent,
				scope: "user",
				transport: "url" in candidate.config ? candidate.config.type : "stdio",
				enabled: true,
				configPath: "",
				plugin: {
					name: candidate.plugin,
					installed: installed.has(candidate.plugin),
					proxied:
						"url" in candidate.config &&
						candidate.config.url.startsWith(PROXY_PREFIX),
				},
				state: "not-configured",
			});
		}
	}

	return entries.sort(compareEntries);
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 64;
const cache = new Map<
	string,
	{ promise: Promise<McpServerEntry[]>; fetchedAt: number }
>();

export function listMcpServers(
	options: DiscoverMcpServersOptions & {
		refresh?: boolean;
		now?: () => number;
		discover?: typeof discoverMcpServers;
	},
): Promise<McpServerEntry[]> {
	const now = options.now ?? Date.now;
	const { paths } = options;
	const key = [
		options.worktreePath,
		options.agent,
		paths.claudeStatePath,
		paths.codexConfigPath,
		paths.installedPluginsPath,
	].join("::");
	const cached = cache.get(key);
	if (!options.refresh && cached && now() - cached.fetchedAt < CACHE_TTL_MS) {
		return cached.promise;
	}
	const promise = (options.discover ?? discoverMcpServers)(options);
	cache.delete(key);
	while (cache.size >= CACHE_MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
	cache.set(key, { promise, fetchedAt: now() });
	promise.catch(() => {
		if (cache.get(key)?.promise === promise) cache.delete(key);
	});
	return promise;
}

export function clearMcpServerCache(): void {
	cache.clear();
}
