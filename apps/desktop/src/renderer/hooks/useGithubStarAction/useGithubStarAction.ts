import { COMPANY } from "@superset/shared/constants";
import { electronTrpc } from "renderer/lib/electron-trpc";

export type GithubStarActionState =
	| "loading"
	| "not_starred"
	| "unknown"
	| "starred";

// GitHub's starred-check API has been observed to flap between 204 and 404 on
// rapid successive calls (see the "flaky checkStarred" fix) — so a
// "not_starred" read moments after we mark the repo starred is more likely
// that flake than a real unstar. Require this much time to have passed since
// we last marked it starred before trusting a "not_starred" read enough to
// unmute again. See StarNagObserver, which schedules a follow-up check right
// as this window closes.
export const UNSTAR_CONFIRM_DELAY_MS = 60_000;

// checkStarred shells out to the user's local `gh` CLI on every fetch, and
// this data changes rarely — there's no reason to treat "the window regained
// focus" as a trigger (every call site disables refetchOnWindowFocus).
// Mount-time fetches gated by this staleTime, plus StarNagObserver's
// deliberate invalidate() calls, are the only triggers.
export const CHECK_STARRED_STALE_TIME_MS = 10 * 60_000;

/**
 * Whether a live "not_starred" read is trustworthy enough to unmute the nag
 * again, given we currently believe the repo is starred. Exported standalone
 * so the grace-window edge cases (never-set completedAt, boundary) are
 * unit-testable without rendering anything.
 */
export function shouldUnmuteOnUnstarredRead(params: {
	completed: boolean;
	completedAt: number | null;
	checkResult: GithubStarActionState | undefined;
	now: number;
}): boolean {
	const { completed, completedAt, checkResult, now } = params;
	if (checkResult !== "not_starred" || !completed) return false;
	// A null completedAt means this account completed under the
	// pre-timestamp schema, which we can't date — treat it as long enough
	// ago to trust immediately.
	return completedAt === null || now - completedAt > UNSTAR_CONFIRM_DELAY_MS;
}

/**
 * How long until the flaky-read grace window closes, or `null` if there's
 * nothing to wait for (not completed, or a pre-timestamp `completedAt` that
 * shouldUnmuteOnUnstarredRead already trusts immediately). Exported
 * standalone for the same reason as shouldUnmuteOnUnstarredRead — the
 * scheduling decision is unit-testable without a real timer or a mounted
 * component.
 */
export function msUntilUnstarGraceWindowCloses(params: {
	completed: boolean;
	completedAt: number | null;
	now: number;
}): number | null {
	const { completed, completedAt, now } = params;
	if (!completed || completedAt === null) return null;
	const msRemaining = completedAt + UNSTAR_CONFIRM_DELAY_MS - now;
	return msRemaining > 0 ? msRemaining : null;
}

interface UseGithubStarActionOptions {
	/**
	 * Skip the checkStarred query entirely. Every check shells out to the
	 * user's local `gh` CLI, so a surface that isn't currently eligible to be
	 * shown (e.g. a feature-flagged sidebar card that's collapsed or
	 * disabled) has no reason to keep checking in the background. Defaults to
	 * true.
	 */
	enabled?: boolean;
	/**
	 * Always fetch a fresh read on mount, ignoring staleTime (still never on
	 * window focus). For a surface the user navigates to specifically to
	 * check status — the Settings row — rather than one that's ambiently
	 * displayed most of a session, staying honest on every visit matters more
	 * than avoiding a `gh` call. Defaults to false.
	 */
	alwaysFreshOnMount?: boolean;
}

/**
 * Shared check-star-repo/star-repo/open-web-fallback flow, reused by every
 * "Star Superset on GitHub" surface (settings row, empty-state pill,
 * threshold card, onboarding toast). `state` is the live, truthful star
 * status — backed by the shared query cache, so a confirmed star from any
 * one surface is reflected on every other mounted surface immediately.
 *
 * Suppression (whether a nag surface should show itself at all) is NOT this
 * hook's concern — StarNagCard and StarNagToast derive that straight from
 * useStarNagStore (shouldShowThresholdCard()/isEligible()), and the pill and
 * Settings row are deliberately always-truthful with no suppression at all.
 *
 * checkResult -> store side effects (markCompleted/markUnstarred) are NOT
 * handled here — StarNagObserver owns that, once, so the four independently
 * mounted surfaces don't each run their own copy of the same effect.
 */
export function useGithubStarAction(options?: UseGithubStarActionOptions) {
	const enabled = options?.enabled ?? true;
	const utils = electronTrpc.useUtils();
	const { data: checkResult, isSuccess } =
		electronTrpc.githubStar.checkStarred.useQuery(undefined, {
			enabled,
			staleTime: CHECK_STARRED_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnMount: options?.alwaysFreshOnMount ? "always" : true,
		});
	const starMutation = electronTrpc.githubStar.star.useMutation();
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();

	const state: GithubStarActionState = isSuccess ? checkResult : "loading";

	const activate = () => {
		if (state === "unknown") {
			openUrlMutation.mutate(COMPANY.GITHUB_URL);
			return;
		}
		if (state !== "not_starred") return;
		// Deliberately NOT optimistic: writing "starred" into the cache before
		// the mutation resolves would make StarNagObserver's checkResult effect
		// treat the optimistic value as confirmation and mark completed — even
		// if the `gh` call then fails, with no path back since a failure lands
		// on "unknown", which shouldUnmuteOnUnstarredRead never acts on.
		// `isBusy` already gives immediate feedback ("Starring…"), so waiting
		// for a real result costs nothing but correctness.
		starMutation.mutate(undefined, {
			onSuccess: async (starred) => {
				// Cancel any in-flight checkStarred fetch first: it may have
				// started before this mutation resolved (e.g. Settings'
				// alwaysFreshOnMount, or a fresh mount elsewhere) and, if left
				// running, could resolve *after* the setData below and silently
				// overwrite this confirmed result with a stale pre-mutation
				// read — react-query's own out-of-order protection only covers
				// its own fetches racing each other, not a fetch racing a
				// direct cache write like setData.
				await utils.githubStar.checkStarred.cancel();
				// Written into the shared query cache (not per-hook-instance
				// state) so every mounted surface reflects the confirmed result
				// immediately; StarNagObserver reacts to the change and marks
				// completed.
				utils.githubStar.checkStarred.setData(
					undefined,
					starred ? "starred" : "unknown",
				);
				if (!starred) markStaleWithoutRefetch(utils);
			},
			onError: async () => {
				await utils.githubStar.checkStarred.cancel();
				utils.githubStar.checkStarred.setData(undefined, "unknown");
				markStaleWithoutRefetch(utils);
			},
		});
	};

	return {
		state,
		activate,
		isBusy: starMutation.isPending || openUrlMutation.isPending,
	};
}

/**
 * A failed/declined star attempt still writes "unknown" into the cache for
 * immediate UI feedback (the web-fallback state), but unlike a real
 * "starred"/"not_starred" confirmation it shouldn't count as a fresh,
 * settled-for-10-minutes read — mark it stale (with no eager refetch of its
 * own) so the next mount naturally rechecks instead of every surface being
 * stuck on the failure fallback for up to staleTime.
 */
function markStaleWithoutRefetch(
	utils: ReturnType<typeof electronTrpc.useUtils>,
) {
	void utils.githubStar.checkStarred.invalidate(undefined, {
		refetchType: "none",
	});
}
