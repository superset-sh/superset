import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
	AmbiguousPluginError,
	buildPluginServer,
	PluginTargetError,
	resolveTarget,
} from "@superset/trpc/plugins-proxy";

export type ToolDefinition = Tool;

/** One connected client per plugin, over the same server the MCP endpoint serves. */
export interface PluginSession {
	client: Client;
	/** Per installation: the same plugin from two marketplaces lists different tools. */
	cacheKey: string;
	close: () => Promise<void>;
}

export interface PluginToolSet {
	context: PluginSession;
	tools: ToolDefinition[];
}

export interface PluginTools {
	sets: Map<string, PluginToolSet>;
	/** False when connections could not be listed: absence then means unknown, not unconnected. */
	resolved: boolean;
	close: () => Promise<void>;
}

export interface ToolCallResult {
	content?: unknown;
	isError?: boolean;
	structuredContent?: unknown;
	[key: string]: unknown;
}

const TOOL_LIST_TTL_MS = 60 * 60 * 1000;

const toolListCache = new Map<
	string,
	{ tools: ToolDefinition[]; expiresAt: number }
>();

export function invalidatePluginToolCache(): void {
	toolListCache.clear();
}

async function openSession(
	userId: string,
	organizationId: string | null,
	plugin: string,
): Promise<PluginSession | null> {
	const target = await resolveTarget({ userId, organizationId, plugin });
	if (target.kind === "needs-auth") return null;

	const server = await buildPluginServer(target);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "slack-agent", version: "1.0.0" });
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return {
		client,
		cacheKey: `${target.connectionId}:${target.plugin}@${target.version}`,
		close: async () => {
			await client.close();
			await server.close();
		},
	};
}

async function cachedListTools(
	session: PluginSession,
	signal: AbortSignal,
): Promise<ToolDefinition[]> {
	const cached = toolListCache.get(session.cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.tools;

	const { tools } = await session.client.listTools(undefined, { signal });
	toolListCache.set(session.cacheKey, {
		tools,
		expiresAt: Date.now() + TOOL_LIST_TTL_MS,
	});
	return tools;
}

export async function loadPluginTools({
	userId,
	organizationId,
	pluginNames,
	signal,
}: {
	userId: string;
	organizationId: string | null;
	pluginNames: Iterable<string>;
	signal: AbortSignal;
}): Promise<PluginTools> {
	const sets = new Map<string, PluginToolSet>();
	let resolved = true;

	await Promise.all(
		[...new Set(pluginNames)].map(async (name) => {
			let session: PluginSession | null = null;
			try {
				session = await openSession(userId, organizationId, name);
			} catch (error) {
				// Not installed is an answer; anything else leaves this plugin's
				// connection state unknown, so the brief must not claim either.
				const absent =
					(error instanceof PluginTargetError && error.status === 404) ||
					error instanceof AmbiguousPluginError;
				if (!absent) resolved = false;
				console.warn(`[slack-agent] Skipping ${name} tools:`, error);
				return;
			}
			// Not connected: absent from the sets means "Connect" in the brief.
			if (!session) return;
			try {
				sets.set(name, {
					context: session,
					tools: await cachedListTools(session, signal),
				});
			} catch (error) {
				// The connection is real, so it stays in the sets with no tools
				// rather than being reported as unconnected.
				console.warn(`[slack-agent] Skipping ${name} tools:`, error);
				sets.set(name, { context: session, tools: [] });
			}
		}),
	);

	return {
		sets,
		resolved,
		close: async () => {
			await Promise.all(
				[...sets.values()].map((set) => set.context.close().catch(() => {})),
			);
		},
	};
}

export async function callPluginTool({
	context,
	tool,
	args,
	signal,
}: {
	context: PluginSession;
	tool: string;
	args: Record<string, unknown>;
	signal: AbortSignal;
}): Promise<ToolCallResult> {
	const result = await context.client.callTool(
		{ name: tool, arguments: args },
		undefined,
		{ signal },
	);
	return (result ?? {}) as ToolCallResult;
}
