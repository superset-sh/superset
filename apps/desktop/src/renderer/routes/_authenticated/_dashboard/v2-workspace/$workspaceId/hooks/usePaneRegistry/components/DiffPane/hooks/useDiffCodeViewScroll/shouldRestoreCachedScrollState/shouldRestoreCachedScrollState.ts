interface CachedScrollState {
	scrollTop: number;
	updatedAt: number;
}

export function shouldRestoreCachedScrollState(
	state: CachedScrollState | undefined,
	navigationTick: number | undefined,
): state is CachedScrollState {
	return (
		state !== undefined &&
		(navigationTick === undefined || state.updatedAt > navigationTick)
	);
}
