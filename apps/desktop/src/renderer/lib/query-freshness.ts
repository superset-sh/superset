/**
 * True when query data was fetched by this window. Data restored from the
 * persisted query cache keeps the time it was fetched in an earlier session.
 */
export function isFromThisWindow(dataUpdatedAt: number): boolean {
	return dataUpdatedAt >= performance.timeOrigin;
}
