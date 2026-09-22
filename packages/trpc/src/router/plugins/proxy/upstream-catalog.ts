import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { type UpstreamTarget, upstreamClient } from "./upstream-client";

const CATALOG_TTL_MS = 5 * 60_000;

interface CatalogEntry {
	connectionId: string;
	tools: Tool[];
	at: number;
}

const catalog = new Map<string, CatalogEntry>();
const inFlight = new Map<string, Promise<Tool[]>>();

// One connection can back several plugins — every Google plugin resolves to the
// same "google" row — so the connection alone would serve one plugin's tools to
// another.
function catalogKey(connectionId: string, plugin: string): string {
	return `${connectionId}:${plugin}`;
}

function prune(): void {
	const now = Date.now();
	for (const [key, entry] of catalog) {
		if (now - entry.at >= CATALOG_TTL_MS) catalog.delete(key);
	}
}

async function fetchTools(
	key: string,
	connectionId: string,
	target: UpstreamTarget,
): Promise<Tool[]> {
	const session = await upstreamClient(target);
	try {
		const { tools } = await session.client.listTools();
		prune();
		catalog.set(key, { connectionId, tools, at: Date.now() });
		return tools;
	} finally {
		await session.close();
	}
}

export async function upstreamTools(
	connectionId: string,
	plugin: string,
	target: UpstreamTarget,
): Promise<Tool[]> {
	const key = catalogKey(connectionId, plugin);
	const cached = catalog.get(key);
	if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.tools;

	// Without this a burst on a cold key opens one upstream session per request,
	// each of which also has to be torn down again.
	const pending = inFlight.get(key);
	if (pending) return await pending;

	const load = fetchTools(key, connectionId, target).finally(() => {
		inFlight.delete(key);
	});
	inFlight.set(key, load);
	return await load;
}

/**
 * Drop every plugin's catalog for a connection, so a reconnect with different
 * scopes does not serve the old tool list. Best-effort: the cache is per
 * process, and only the process handling the disconnect is cleared.
 */
export function forgetUpstreamTools(connectionId: string): void {
	for (const [key, entry] of catalog) {
		if (entry.connectionId === connectionId) catalog.delete(key);
	}
}
