import { existsSync } from "node:fs";
import type { ExternalWorktree } from "./git";

interface TrackedWorktreeForReconciliation {
	id: string;
	path: string;
	branch: string;
	hasActiveWorkspace: boolean;
}

interface GetStaleTrackedWorktreeIdsArgs {
	trackedWorktrees: TrackedWorktreeForReconciliation[];
	liveWorktrees: ExternalWorktree[];
	pathExists?: (path: string) => boolean;
}

export function getStaleTrackedWorktreeIds({
	trackedWorktrees,
	liveWorktrees,
	pathExists = existsSync,
}: GetStaleTrackedWorktreeIdsArgs): string[] {
	const liveWorktreeByPath = new Map(liveWorktrees.map((wt) => [wt.path, wt]));
	const staleIds: string[] = [];

	for (const trackedWorktree of trackedWorktrees) {
		if (trackedWorktree.hasActiveWorkspace) {
			continue;
		}

		if (!pathExists(trackedWorktree.path)) {
			staleIds.push(trackedWorktree.id);
			continue;
		}

		const liveWorktree = liveWorktreeByPath.get(trackedWorktree.path);
		if (!liveWorktree) {
			staleIds.push(trackedWorktree.id);
			continue;
		}

		if (
			liveWorktree.isBare ||
			liveWorktree.isDetached ||
			!liveWorktree.branch ||
			liveWorktree.branch !== trackedWorktree.branch
		) {
			staleIds.push(trackedWorktree.id);
		}
	}

	return staleIds;
}
