import os from "node:os";
import type { SlashCommand } from "@superset/shared/slash-commands";
import {
	getSlashCommandDiscovery,
	SLASH_COMMAND_DISCOVERY,
	type SlashCommandDiscoveryEntry,
} from "../registry";

/**
 * 30s TTL: absorbs the refetch burst while a composer menu is open, yet a
 * newly saved command file appears on the next open without restarting
 * anything. The PROMISE is cached (not the value) so concurrent opens
 * coalesce onto one scan; a rejected promise is evicted immediately so one
 * flaky read doesn't pin an error for 30s. Insertion-order LRU bounded the
 * way workspace-fs's search index is (delete + re-set on hit, evict oldest
 * at capacity). The key includes the resolved config dir, so an account
 * switch reads fresh immediately instead of waiting out the TTL.
 */
const DISCOVERY_CACHE_TTL_MS = 30_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 64;

const discoveryCache = new Map<
	string,
	{ promise: Promise<SlashCommand[]>; fetchedAt: number }
>();

export interface ListAgentSlashCommandsOptions {
	worktreePath: string;
	/** Raw client-supplied agent id (presetId or config UUID) — cache-key part. */
	agentId: string;
	/** Resolved presetId (config.presetId, or agentId when no config row exists). */
	presetId: string;
	/** Effective launch env overlay: account default + config env. */
	env: Record<string, string>;
	/** Test injection points. */
	homeDir?: string;
	registry?: readonly SlashCommandDiscoveryEntry[];
	now?: () => number;
}

export async function listAgentSlashCommands(
	options: ListAgentSlashCommandsOptions,
): Promise<SlashCommand[]> {
	const registry = options.registry ?? SLASH_COMMAND_DISCOVERY;
	const entry = options.registry
		? registry.find((candidate) => candidate.presetId === options.presetId)
		: getSlashCommandDiscovery(options.presetId);
	if (!entry) return [];

	const configDir = entry.resolveConfigDir(
		options.env,
		options.homeDir ?? os.homedir(),
	);
	const now = options.now ?? Date.now;
	const key = `${options.worktreePath}::${options.agentId}::${configDir}`;
	const cached = discoveryCache.get(key);
	if (cached && now() - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
		discoveryCache.delete(key);
		discoveryCache.set(key, cached);
		return cached.promise;
	}

	const promise = entry.scan({
		worktreePath: options.worktreePath,
		configDir,
	});
	discoveryCache.delete(key);
	while (discoveryCache.size >= DISCOVERY_CACHE_MAX_ENTRIES) {
		const oldestKey = discoveryCache.keys().next().value;
		if (!oldestKey) break;
		discoveryCache.delete(oldestKey);
	}
	discoveryCache.set(key, { promise, fetchedAt: now() });
	// The TTL clock starts when the scan finishes, so a slow scan stays
	// shareable for its full window instead of expiring mid-flight; a
	// rejected scan is evicted so one flaky read doesn't pin an error.
	promise.then(
		() => {
			const current = discoveryCache.get(key);
			if (current?.promise === promise) current.fetchedAt = now();
		},
		() => {
			if (discoveryCache.get(key)?.promise === promise) {
				discoveryCache.delete(key);
			}
		},
	);
	return promise;
}

export function clearSlashCommandDiscoveryCache(): void {
	discoveryCache.clear();
}
