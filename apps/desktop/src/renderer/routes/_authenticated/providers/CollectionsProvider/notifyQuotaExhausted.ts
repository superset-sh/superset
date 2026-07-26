import { toast } from "@superset/ui/sonner";
import { clearAllTerminalSnapshots } from "./terminalSnapshotStorage";

/**
 * What the user sees when localStorage is full and reclaiming orphaned
 * terminal snapshots did not free enough for the write to land.
 *
 * The write is dropped either way — there is genuinely no room, and dropping it
 * instead of throwing is what stops the freeze (see `withQuotaGuard`). This
 * only decides how loudly to say so, which is a product call rather than a
 * correctness one, so the modes are kept side by side and selected by
 * `QUOTA_NOTICE_MODE`:
 *
 * - `silent`: console only, matching how `terminal-runtime-registry` already
 *   handles the same error. Quietest, but the user later finds their layout
 *   reverted with no explanation.
 * - `notify`: also raises a toast. Explains the reverted layout, but offers
 *   nothing to act on.
 * - `offer-reclaim`: adds an action that clears parked terminals' scrollback.
 *   The only option that can actually free space, and the only one that costs
 *   the user something visible.
 */
export type QuotaNoticeMode = "silent" | "notify" | "offer-reclaim";

export const QUOTA_NOTICE_MODE: QuotaNoticeMode = "silent";

const TOAST_ID = "localstorage-quota-exhausted";

const warnedStorageKeys = new Set<string>();

/**
 * Warns once per storage key. The loop this replaces fired ~40x a second, so an
 * un-deduped log would just relocate the problem; the toast dedupes separately
 * via a stable `id`, which lets a dismissed toast reappear on a later failure.
 */
function warnOnce(storageKey: string): void {
	if (warnedStorageKeys.has(storageKey)) return;
	warnedStorageKeys.add(storageKey);
	console.warn(
		`[collections] localStorage is full; "${storageKey}" will not persist. Changes stay in memory but revert on next launch.`,
	);
}

/**
 * Exported so the wording is testable without mocking the storage module. The
 * count is storage entries, not terminals — each terminal persists a buffer and
 * a dimensions key — so it is described as such rather than implying a terminal
 * count twice the real one.
 */
export function describeClearedSnapshots(cleared: number): string {
	if (cleared === 0) return "No saved terminal scrollback left to clear";
	return `Cleared ${cleared} saved terminal ${cleared === 1 ? "entry" : "entries"}`;
}

function reclaimFromToast(): void {
	toast.success(describeClearedSnapshots(clearAllTerminalSnapshots()), {
		id: TOAST_ID,
	});
}

/**
 * `mode` defaults to the configured `QUOTA_NOTICE_MODE`; it is a parameter so
 * every branch stays reachable from tests regardless of which one ships.
 */
export function notifyQuotaExhausted(
	storageKey: string,
	mode: QuotaNoticeMode = QUOTA_NOTICE_MODE,
): void {
	warnOnce(storageKey);
	if (mode === "silent") return;

	toast.warning("Storage is full", {
		id: TOAST_ID,
		description:
			"Layout and sidebar changes are kept for this session but revert when Superset restarts.",
		action:
			mode === "offer-reclaim"
				? { label: "Free up space", onClick: reclaimFromToast }
				: undefined,
	});
}
