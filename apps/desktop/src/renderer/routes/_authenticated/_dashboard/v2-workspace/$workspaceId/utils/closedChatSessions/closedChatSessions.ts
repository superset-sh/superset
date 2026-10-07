const closed = new Set<string>();

export function markChatSessionClosed(sessionId: string): () => void {
	closed.add(sessionId);
	return () => closed.delete(sessionId);
}

export function isChatSessionClosed(sessionId: string): boolean {
	return closed.has(sessionId);
}
