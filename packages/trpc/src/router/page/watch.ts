export const WATCH_STALE_MS = 90_000;

export interface PageWatchState {
	watching: boolean;
	agentId: string | null;
}

export function watchState(
	page: { watchedByAgent: string | null; watchHeartbeatAt: Date | null },
	now: number,
): PageWatchState {
	const beat = page.watchHeartbeatAt;
	if (beat === null || now - beat.getTime() >= WATCH_STALE_MS) {
		return { watching: false, agentId: null };
	}
	return { watching: true, agentId: page.watchedByAgent };
}
