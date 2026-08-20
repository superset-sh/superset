import { useEffect } from "react";
import {
	CHECK_STARRED_STALE_TIME_MS,
	msUntilUnstarGraceWindowCloses,
	shouldUnmuteOnUnstarredRead,
} from "renderer/hooks/useGithubStarAction";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStarNagStore } from "renderer/stores/star-nag";

// Backstop for the case where no star-nag surface (pill, settings, card,
// toast) happens to mount for a long time after the repo is unstarred — e.g.
// one empty pane left open for hours with no navigation. The grace-window
// follow-up below already covers the common case (unstarred shortly after
// starring); this only matters for a long-tail idle session. Deliberately
// infrequent and gated to only-while-muted — an un-completed user already
// gets frequent live checks from whichever surface is currently showing the
// ask.
const UNSTAR_BACKSTOP_INTERVAL_MS = 30 * 60_000;

/**
 * App-shell singleton — mounted once in the authenticated layout, renders
 * nothing — that owns every checkStarred -> useStarNagStore side effect, so
 * the four independently-mounted star-nag surfaces (settings row,
 * empty-state pill, sidebar card, onboarding toast) don't each run their own
 * copy of this logic.
 *
 * Also the only place that ever schedules a deliberate re-check of star
 * status. Never on window focus — the three triggers are:
 *   1. once per app session, from this component's own always-enabled query
 *      (the query cache is empty on a fresh launch, so this fires for free);
 *   2. right as the flaky-checkStarred grace window closes after marking
 *      completed, so a genuine unstar shortly after starring isn't stuck
 *      behind a 60s window with no follow-up; and
 *   3. a slow backstop interval while muted, in case nothing else remounts
 *      for a long time.
 */
export function StarNagObserver() {
	const utils = electronTrpc.useUtils();
	const completed = useStarNagStore((s) => s.completed);
	const completedAt = useStarNagStore((s) => s.completedAt);
	const markCompleted = useStarNagStore((s) => s.markCompleted);
	const markUnstarred = useStarNagStore((s) => s.markUnstarred);

	const { data: checkResult, dataUpdatedAt } =
		electronTrpc.githubStar.checkStarred.useQuery(undefined, {
			staleTime: CHECK_STARRED_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			// Without this, the backstop interval simply doesn't fire while the
			// window is unfocused/backgrounded (TanStack Query's default) — which
			// is exactly the "one empty pane left open for a while" scenario it
			// exists for.
			refetchIntervalInBackground: true,
			refetchInterval: completed ? UNSTAR_BACKSTOP_INTERVAL_MS : false,
		});

	// dataUpdatedAt is deliberately in the deps below though unreferenced
	// here: the scheduled re-verify can resolve to the *same* checkResult
	// string as the read that started the grace window (e.g. "not_starred"
	// both times) — without a value that changes on every completed fetch,
	// React sees no dependency change and skips re-running this effect
	// entirely, so a confirmed unstar can silently never call markUnstarred().
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (checkResult === "starred" && !completed) {
			markCompleted();
			return;
		}
		if (
			shouldUnmuteOnUnstarredRead({
				completed,
				completedAt,
				checkResult,
				now: Date.now(),
			})
		) {
			markUnstarred();
		}
	}, [
		checkResult,
		dataUpdatedAt,
		completed,
		completedAt,
		markCompleted,
		markUnstarred,
	]);

	// A "not_starred" read inside the grace window is ignored above (that's
	// the flaky-checkStarred protection) — schedule exactly one re-verify
	// right when the window closes, via a plain invalidate() rather than a
	// direct markUnstarred(), so the result still passes through the same
	// effect above and only unmutes if the fresh read still says not_starred.
	useEffect(() => {
		const msRemaining = msUntilUnstarGraceWindowCloses({
			completed,
			completedAt,
			now: Date.now(),
		});
		if (msRemaining === null) return;
		const timer = setTimeout(() => {
			void utils.githubStar.checkStarred.invalidate();
		}, msRemaining);
		return () => clearTimeout(timer);
	}, [completed, completedAt, utils]);

	return null;
}
