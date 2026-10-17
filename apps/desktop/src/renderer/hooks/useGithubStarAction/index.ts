export type { GithubStarActionState } from "./useGithubStarAction";
export {
	CHECK_STARRED_STALE_TIME_MS,
	canActivateStarAction,
	isCelebratableStarTransition,
	JUST_STARRED_ATTRIBUTION_WINDOW_MS,
	msUntilUnstarGraceWindowCloses,
	STAR_SUCCESS_ANIMATION_MS,
	shouldCelebrateStarTransition,
	shouldUnmuteOnUnstarredRead,
	UNSTAR_CONFIRM_DELAY_MS,
	useGithubStarAction,
	useJustStarredWindow,
	useTrackShownOnce,
} from "./useGithubStarAction";
