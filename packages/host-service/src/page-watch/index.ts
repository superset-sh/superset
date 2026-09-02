export {
	HEARTBEAT_INTERVAL_MS,
	IDLE_TTL_MS,
	MAX_CONSECUTIVE_FAILURES,
	MAX_HOLD_MS,
	MAX_WATCHERS,
	type PageWatchApi,
	type PageWatchDeps,
	PageWatchManager,
	TICK_INTERVAL_MS,
} from "./page-watch-manager.ts";
export { agentIsBusy, MAX_PINGS_PER_THREAD } from "./trigger.ts";
export type {
	PageWatchAssignment,
	PageWatchStatus,
	WatchedThread,
} from "./types.ts";
