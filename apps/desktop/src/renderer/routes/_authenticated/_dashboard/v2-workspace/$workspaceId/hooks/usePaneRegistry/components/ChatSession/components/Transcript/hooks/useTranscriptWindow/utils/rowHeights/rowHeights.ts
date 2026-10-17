const MAX_CACHED_SESSIONS = 5;

const heightsBySession = new Map<string, Map<string, number>>();

export function rowHeightsFor(sessionId: string): Map<string, number> {
	const heights = heightsBySession.get(sessionId) ?? new Map<string, number>();
	heightsBySession.delete(sessionId);
	heightsBySession.set(sessionId, heights);
	for (const oldest of heightsBySession.keys()) {
		if (heightsBySession.size <= MAX_CACHED_SESSIONS) break;
		heightsBySession.delete(oldest);
	}
	return heights;
}
