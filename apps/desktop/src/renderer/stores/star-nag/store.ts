import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Placeholder starting point, not a researched number — see apps/desktop/plans/20260814-1500-github-star-nag.md. */
export const STAR_NAG_INITIAL_THRESHOLD = 5;
const STAR_NAG_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface StarNagState {
	/** Muted — starred from any surface (or detected already-starred). Cleared if the repo is later confirmed unstarred, see useGithubStarAction. */
	completed: boolean;
	/** When `completed` last became true; `null` only if never completed — the persist `merge` config backfills this to "now" on rehydration for pre-timestamp-schema profiles, so a null here always means "never". */
	completedAt: number | null;
	/** New (never previously seen) workspaces created since the last reset. */
	workspacesCreatedSinceBaseline: number;
	/** Doubles every time the threshold card is dismissed without starring. */
	nextThreshold: number;
	/** Cooldown expiry after a dismissal; `null` means no active cooldown. */
	deferredUntil: number | null;
	recordWorkspaceCreated: () => void;
	/** Not permanently muted and not within an active cooldown. Shared by every trigger source (threshold card, onboarding toast). */
	isEligible: () => boolean;
	shouldShowThresholdCard: () => boolean;
	/** User saw the threshold card and said "later" (or dismissed it) without starring. */
	dismiss: () => void;
	/** A trigger the user never actually engaged with timed out on its own (e.g. the onboarding toast's auto-dismiss) — starts the same cooldown as `dismiss()` but, since there was no real "no thanks", doesn't also double the threshold. */
	snoozeThresholdCard: () => void;
	markCompleted: () => void;
	/** Repo confirmed unstarred after previously being completed — unmutes every surface and starts the standard cooldown before the threshold card can show again. */
	markUnstarred: () => void;
}

/**
 * A v1 workspace create/import/open result counts toward the star-nag
 * threshold when it produced a genuinely new workspace (`wasExisting` is
 * false). Centralized so every v1 creation path — create, createFromPr,
 * openMainRepoWorkspace — stays in sync; previously only the plain create
 * path called this, silently excluding PR- and main-repo-branch-driven
 * creates from the threshold.
 */
export function recordV1WorkspaceCreatedIfNew(wasExisting: boolean): void {
	if (!wasExisting) useStarNagStore.getState().recordWorkspaceCreated();
}

function isEligible(state: Pick<StarNagState, "completed" | "deferredUntil">) {
	if (state.completed) return false;
	if (state.deferredUntil && state.deferredUntil > Date.now()) return false;
	return true;
}

/**
 * Backfills `completedAt` for profiles rehydrated from the pre-timestamp
 * schema (`completed: true`, no `completedAt`) — otherwise every
 * pre-existing starred user is exposed to the flaky-204/404 checkStarred
 * read on their very first post-rollout check, with none of the grace
 * window that protects a newly-completed user. Exported standalone, like
 * the other decision functions in this module, so it's unit-testable
 * without exercising zustand's persist rehydration.
 */
export function backfillCompletedAt<
	T extends Pick<StarNagState, "completed" | "completedAt">,
>(
	merged: T,
	now: number,
): Omit<T, "completedAt"> & { completedAt: number | null } {
	if (merged.completed && merged.completedAt == null) {
		return { ...merged, completedAt: now };
	}
	return merged;
}

export const useStarNagStore = create<StarNagState>()(
	devtools(
		persist(
			(set, get) => ({
				completed: false,
				completedAt: null,
				workspacesCreatedSinceBaseline: 0,
				nextThreshold: STAR_NAG_INITIAL_THRESHOLD,
				deferredUntil: null,
				recordWorkspaceCreated: () =>
					set((s) => ({
						workspacesCreatedSinceBaseline:
							s.workspacesCreatedSinceBaseline + 1,
					})),
				isEligible: () => isEligible(get()),
				shouldShowThresholdCard: () => {
					const s = get();
					return (
						isEligible(s) && s.workspacesCreatedSinceBaseline >= s.nextThreshold
					);
				},
				dismiss: () =>
					set((s) => ({
						nextThreshold: s.nextThreshold * 2,
						workspacesCreatedSinceBaseline: 0,
						deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
					})),
				snoozeThresholdCard: () =>
					set({ deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS }),
				markCompleted: () =>
					set({
						completed: true,
						completedAt: Date.now(),
						deferredUntil: null,
					}),
				markUnstarred: () =>
					set({
						completed: false,
						completedAt: null,
						// workspacesCreatedSinceBaseline/nextThreshold are left exactly
						// as they were at completion time, which — without a cooldown —
						// could put the threshold card immediately back over its own
						// bar the instant the unstar is detected. Give it the same
						// grace period a real dismissal gets instead of popping back up
						// the moment we notice.
						deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
					}),
			}),
			// Fixed-size singleton, not entity-keyed — no bound/deletion path needed
			// per apps/desktop/AGENTS.md. If the star nag is ever removed (it's
			// flag-killable by design), move "star-nag-v1" into DEAD_KEYS
			// (renderer/lib/persisted-keys/persisted-keys.ts) in the same PR.
			{
				name: "star-nag-v1",
				// Profiles that completed under the pre-completedAt schema
				// rehydrate with completed: true, completedAt: null.
				// shouldUnmuteOnUnstarredRead treats a null completedAt as "trust
				// the next not_starred read immediately" — reasonable for an
				// account we truly can't date, but that describes every
				// pre-existing starred user the instant this ships, exposing the
				// whole existing population to the exact flaky-204/404 read this
				// grace window exists to absorb. Stamping "now" here instead gives
				// them the same fresh grace window a newly-completed user gets.
				merge: (persisted, current) =>
					backfillCompletedAt(
						{ ...current, ...(persisted as Partial<StarNagState>) },
						Date.now(),
					),
			},
		),
		{ name: "StarNagStore" },
	),
);
