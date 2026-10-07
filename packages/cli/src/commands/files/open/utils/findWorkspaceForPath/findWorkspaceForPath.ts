import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export interface WorktreeCandidate {
	id: string;
	worktreePath: string;
	/** Absent on rows from older hosts; false means the checkout is gone. */
	worktreeExists?: boolean;
}

function canonical(path: string): string {
	const absolute = resolve(path);
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}

/**
 * The workspace whose worktree contains `path`. Both sides are resolved
 * through symlinks first (macOS keeps /tmp under /private), and the deepest
 * worktree wins so a workspace nested inside another's checkout is matched
 * over its parent. A workspace whose checkout is gone never matches: a new
 * worktree can reuse an archived one's path.
 */
export function findWorkspaceForPath<T extends WorktreeCandidate>(
	workspaces: readonly T[],
	path: string,
): T | undefined {
	const target = canonical(path);
	let best: { workspace: T; depth: number } | undefined;
	for (const workspace of workspaces) {
		if (!workspace.worktreePath || workspace.worktreeExists === false) continue;
		const root = canonical(workspace.worktreePath);
		const contains = target === root || target.startsWith(root + sep);
		if (!contains) continue;
		const depth = root.split(sep).length;
		if (!best || depth > best.depth) best = { workspace, depth };
	}
	return best?.workspace;
}
