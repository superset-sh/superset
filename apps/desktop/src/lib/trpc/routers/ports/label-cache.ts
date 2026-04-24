import { statSync } from "node:fs";
import { join } from "node:path";
import { workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { loadStaticPorts } from "main/lib/static-ports";
import { PORTS_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { getWorkspacePath } from "../workspaces/utils/worktree";

interface LabelCacheEntry {
	labels: Map<number, string> | null;
	portsFileSignature: string | null;
	worktreePath: string | null;
}

function getPortsFileSignature(worktreePath: string): string | null {
	try {
		const stat = statSync(
			join(worktreePath, PROJECT_SUPERSET_DIR_NAME, PORTS_FILE_NAME),
		);
		return `${stat.mtimeMs}:${stat.size}`;
	} catch {
		return null;
	}
}

/**
 * Resolve `ports.json` labels per workspace on demand, then memoize.
 *
 * Why memoize: `getAll` runs on every `port:add`/`port:remove` event (the
 * renderer calls `utils.ports.getAll.invalidate()` in usePortsData). A dev
 * server that flaps 5 ports cascades into 5 `getAll` calls × N workspaces of
 * sync SQLite reads on the main thread. Cache once; ports.json rarely changes.
 *
 * A resolved entry of `null` means "no labels file" — still cached so we don't
 * re-check the filesystem every event.
 *
 * Lives in its own module so workspace-delete paths in `workspaces/utils/*`
 * can call `invalidatePortLabelCache` without creating a ports ↔ workspaces
 * import cycle.
 */
const labelCache = new Map<string, LabelCacheEntry>();

function loadLabelsForWorktree(
	worktreePath: string,
): Map<number, string> | null {
	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) {
		return null;
	}

	const labels = new Map<number, string>();
	for (const p of result.ports) {
		labels.set(p.port, p.label);
	}
	return labels;
}

function setLabelCache(
	workspaceId: string,
	worktreePath: string | null,
	labels: Map<number, string> | null,
): Map<number, string> | null {
	labelCache.set(workspaceId, {
		labels,
		portsFileSignature: worktreePath
			? getPortsFileSignature(worktreePath)
			: null,
		worktreePath,
	});
	return labels;
}

export function getLabelsForWorkspace(
	workspaceId: string,
): Map<number, string> | null {
	const cached = labelCache.get(workspaceId);
	if (cached) {
		if (cached.worktreePath === null) return cached.labels;
		const currentSignature = getPortsFileSignature(cached.worktreePath);
		if (currentSignature === cached.portsFileSignature) return cached.labels;
		return setLabelCache(
			workspaceId,
			cached.worktreePath,
			loadLabelsForWorktree(cached.worktreePath),
		);
	}

	const ws = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const worktreePath = ws ? getWorkspacePath(ws) : null;
	if (!worktreePath) {
		return setLabelCache(workspaceId, null, null);
	}

	return setLabelCache(
		workspaceId,
		worktreePath,
		loadLabelsForWorktree(worktreePath),
	);
}

/**
 * Invalidate the label cache. Call when a workspace is deleted or its
 * `ports.json` is edited — otherwise stale labels linger until app restart.
 */
export function invalidatePortLabelCache(workspaceId?: string): void {
	if (workspaceId === undefined) {
		labelCache.clear();
	} else {
		labelCache.delete(workspaceId);
	}
}
