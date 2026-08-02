export interface KindSummary {
	migrated: number;
	linked: number;
	skipped: number;
	failed: number;
	/** Entities we deliberately left for a later run (e.g. project not yet imported). */
	deferred: number;
}

export function emptySummary(): KindSummary {
	return { migrated: 0, linked: 0, skipped: 0, failed: 0, deferred: 0 };
}

/**
 * D4 flip gate. Deliberate skips (no worktree on disk, ambiguous/duplicate
 * repos, cloud unreachable) are "nothing to migrate here" classifications,
 * not pending work — aged installs always have some, so they must not hold
 * the flip hostage. They stay non-terminal in the ledger and retry each
 * pass, so e.g. a restored worktree still adopts later. Only real failures
 * and work we intend to complete (deferred) block the flip; persistent
 * failures are the forced-flip backstop's job.
 */
export function computeGateComplete(
	projects: KindSummary,
	workspaces: KindSummary,
): boolean {
	return (
		projects.failed + projects.deferred === 0 &&
		workspaces.failed + workspaces.deferred === 0
	);
}
