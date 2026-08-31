import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	parseStaticPortsConfig,
	type StaticPortEntry,
} from "@superset/port-scanner";

const PROJECT_SUPERSET_DIR_NAME = ".superset";
const PORTS_FILE_NAME = "ports.json";

interface StaticPortCacheEntry {
	entries: Map<number, StaticPortEntry> | null;
	portsFileSignature: string | null;
	worktreePath: string | null;
}

function getPortsPath(worktreePath: string): string {
	return join(worktreePath, PROJECT_SUPERSET_DIR_NAME, PORTS_FILE_NAME);
}

function isMissingPathError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
}

function getPortsFileSignature(worktreePath: string): string | null {
	try {
		const stat = statSync(getPortsPath(worktreePath));
		return `${stat.mtimeMs}:${stat.size}`;
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

function safeGetPortsFileSignature(worktreePath: string): string | null {
	try {
		return getPortsFileSignature(worktreePath);
	} catch (error) {
		console.warn("[ports] Failed to stat static port entries:", {
			worktreePath,
			error,
		});
		return null;
	}
}

function readPortsFile(worktreePath: string): string | null {
	try {
		return readFileSync(getPortsPath(worktreePath), "utf-8");
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

function safeLoadEntries(
	worktreePath: string,
): Map<number, StaticPortEntry> | null {
	try {
		return loadEntries(worktreePath);
	} catch (error) {
		console.warn("[ports] Failed to load static port entries:", {
			worktreePath,
			error,
		});
		return null;
	}
}

/**
 * Read `<worktree>/.superset/ports.json` and return a `port → entry` map.
 * Returns null if the file is missing or malformed — this endpoint is a
 * best-effort hint, not a validator, so parse errors are silent.
 */
function loadEntries(
	worktreePath: string,
): Map<number, StaticPortEntry> | null {
	const content = readPortsFile(worktreePath);
	if (content === null) return null;

	const parsed = parseStaticPortsConfig(content);
	if (parsed.ports === null) return null;

	const entries = new Map<number, StaticPortEntry>();
	for (const port of parsed.ports) {
		entries.set(port.port, port);
	}
	return entries;
}

/**
 * Memoize entry lookups per workspaceId. Called by host port snapshots and
 * add-event enrichment, so the workspace-root + fs reads would otherwise repeat
 * needlessly. `entries: null` with a resolved worktree means "no entries file" —
 * that negative can stick until the file signature changes. A missing
 * worktreePath is not cached because workspace hydration can race first reads.
 */
const staticPortCache = new Map<string, StaticPortCacheEntry>();

function setStaticPortCache(
	workspaceId: string,
	worktreePath: string | null,
	entries: Map<number, StaticPortEntry> | null,
): Map<number, StaticPortEntry> | null {
	const portsFileSignature = worktreePath
		? safeGetPortsFileSignature(worktreePath)
		: null;
	staticPortCache.set(workspaceId, {
		entries,
		portsFileSignature,
		worktreePath,
	});
	return entries;
}

export function getStaticPortsForWorkspace(
	resolveWorktreePath: (workspaceId: string) => string | null,
	workspaceId: string,
): Map<number, StaticPortEntry> | null {
	const cached = staticPortCache.get(workspaceId);
	if (cached) {
		if (cached.worktreePath === null) {
			staticPortCache.delete(workspaceId);
		} else {
			const currentSignature = safeGetPortsFileSignature(cached.worktreePath);
			if (currentSignature === cached.portsFileSignature) return cached.entries;
			return setStaticPortCache(
				workspaceId,
				cached.worktreePath,
				safeLoadEntries(cached.worktreePath),
			);
		}
	}

	const worktreePath = resolveWorktreePath(workspaceId);
	if (!worktreePath) return null;

	return setStaticPortCache(
		workspaceId,
		worktreePath,
		safeLoadEntries(worktreePath),
	);
}

export function invalidateStaticPortCache(workspaceId?: string): void {
	if (workspaceId === undefined) staticPortCache.clear();
	else staticPortCache.delete(workspaceId);
}
