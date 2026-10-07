const inflight = new Map<string, Promise<string>>();
const watchers = new Map<string, number>();

export function watchChatCreate(key: string): () => void {
	watchers.set(key, (watchers.get(key) ?? 0) + 1);
	return () => {
		const remaining = (watchers.get(key) ?? 1) - 1;
		if (remaining > 0) watchers.set(key, remaining);
		else watchers.delete(key);
	};
}

export function isChatCreateWatched(key: string): boolean {
	return watchers.has(key);
}

export function sharedChatCreate(
	key: string,
	create: () => Promise<string>,
	close: (sessionId: string) => void,
): Promise<string> {
	const running = inflight.get(key);
	if (running) return running;
	const started = create()
		.then((sessionId) => {
			if (!watchers.has(key)) close(sessionId);
			return sessionId;
		})
		.finally(() => inflight.delete(key));
	inflight.set(key, started);
	return started;
}
