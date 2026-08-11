import { statSync } from "node:fs";
import { join } from "node:path";
import { workspaces } from "@superset/local-db";
import type { StaticPortEntry } from "@superset/port-scanner";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { loadStaticPorts } from "main/lib/static-ports";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { getWorkspacePath } from "../workspaces/utils/worktree";

interface StaticPortCacheEntry {
	entries: Map<number, StaticPortEntry> | null;
	portsFileSignature: string | null;
	worktreePath: string | null;
}

function getPortsFileSignature(worktreePath: string): string | null {
	try {
		const stat = statSync(
			join(worktreePath, PROJECT_SUPERSET_DIR_NAME, PORTS_FILE_NAME),
		);
		return `${stat.mtimeMs}:${stat.size}`;
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

function isMissingPathError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
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

function safeLoadEntriesForWorktree(
	worktreePath: string,
): Map<number, StaticPortEntry> | null {
	try {
		return loadEntriesForWorktree(worktreePath);
	} catch (error) {
		console.warn("[ports] Failed to load static port entries:", {
			worktreePath,
			error,
		});
		return null;
	}
}

/**
 * Resolve `ports.json` entries per workspace on demand, then memoize.
 *
 * Why memoize: `getAll` runs on every `port:add`/`port:remove` event (the
 * renderer calls `utils.ports.getAll.invalidate()` in usePortsData). A dev
 * server that flaps 5 ports cascades into 5 `getAll` calls × N workspaces of
 * sync SQLite reads on the main thread. Cache once; ports.json rarely changes.
 *
 * `entries: null` with a resolved worktree means "no entries file" — still
 * cached so we don't re-check the filesystem every event. A missing worktree is
 * not cached because workspace hydration can race first reads.
 *
 * Lives in its own module so workspace-delete paths in `workspaces/utils/*`
 * can call `invalidateStaticPortCache` without creating a ports ↔ workspaces
 * import cycle.
 */
const staticPortCache = new Map<string, StaticPortCacheEntry>();

function loadEntriesForWorktree(
	worktreePath: string,
): Map<number, StaticPortEntry> | null {
	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) {
		return null;
	}

	const entries = new Map<number, StaticPortEntry>();
	for (const p of result.ports) {
		entries.set(p.port, p);
	}
	return entries;
}

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
				safeLoadEntriesForWorktree(cached.worktreePath),
			);
		}
	}

	const ws = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const worktreePath = ws ? getWorkspacePath(ws) : null;
	if (!worktreePath) {
		return null;
	}

	return setStaticPortCache(
		workspaceId,
		worktreePath,
		safeLoadEntriesForWorktree(worktreePath),
	);
}

/**
 * Invalidate the static-port cache. Call when a workspace is deleted. Edits to
 * `ports.json` are detected by the cached file signature.
 */
export function invalidateStaticPortCache(workspaceId?: string): void {
	if (workspaceId === undefined) {
		staticPortCache.clear();
	} else {
		staticPortCache.delete(workspaceId);
	}
}
