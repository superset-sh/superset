export interface ImportOutcomeArgs {
	totalAttempted: number;
	totalImported: number;
}

export interface ImportOutcomeDecision {
	action: "stay" | "finish";
	successMessage: string | null;
}

/**
 * Decide what to do after the import loop finishes:
 *  - All failed (with selections made): stay on the page so the user can
 *    retry rather than getting yanked into the dashboard.
 *  - Any failures (but at least one success): also stay — the user picked
 *    those worktrees deliberately, and silently dropping them when most
 *    succeeded loses work without a retry path.
 *  - All succeeded: finish. Toast the count.
 *  - Nothing to import (no selections): finish silently.
 */
export function decideImportOutcome({
	totalAttempted,
	totalImported,
}: ImportOutcomeArgs): ImportOutcomeDecision {
	if (totalAttempted === 0) {
		return { action: "finish", successMessage: null };
	}
	if (totalImported < totalAttempted) {
		return { action: "stay", successMessage: null };
	}
	return {
		action: "finish",
		successMessage: `Imported ${totalImported} workspace${totalImported === 1 ? "" : "s"}`,
	};
}
