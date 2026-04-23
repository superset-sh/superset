import { workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { loadStaticPorts } from "main/lib/static-ports";
import { getWorkspacePath } from "../workspaces/utils/worktree";

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
const labelCache = new Map<string, Map<number, string> | null>();

export function getLabelsForWorkspace(
	workspaceId: string,
): Map<number, string> | null {
	if (labelCache.has(workspaceId)) {
		return labelCache.get(workspaceId) ?? null;
	}

	const ws = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	const worktreePath = ws ? getWorkspacePath(ws) : null;
	if (!worktreePath) {
		labelCache.set(workspaceId, null);
		return null;
	}

	const result = loadStaticPorts(worktreePath);
	if (!result.exists || result.error || !result.ports) {
		labelCache.set(workspaceId, null);
		return null;
	}

	const labels = new Map<number, string>();
	for (const p of result.ports) {
		labels.set(p.port, p.label);
	}
	labelCache.set(workspaceId, labels);
	return labels;
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
