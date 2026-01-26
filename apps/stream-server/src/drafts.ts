/**
 * Draft state management for real-time draft sync
 *
 * Tracks what users are typing in each chat session,
 * enabling real-time "typing preview" for all viewers.
 */

export interface Draft {
	userId: string;
	userName: string;
	content: string;
	updatedAt: number;
}

// In-memory store: sessionId → userId → Draft
const drafts = new Map<string, Map<string, Draft>>();

// Active SSE subscribers for draft updates
const subscribers = new Map<string, Set<(draft: Draft) => void>>();

// Draft timeout - clear if not updated in 60 seconds
const DRAFT_TIMEOUT_MS = 60_000;

/**
 * Set or update a draft for a user in a session
 */
export function setDraft({
	sessionId,
	userId,
	userName,
	content,
}: {
	sessionId: string;
	userId: string;
	userName: string;
	content: string;
}): Draft {
	let sessionDrafts = drafts.get(sessionId);
	if (!sessionDrafts) {
		sessionDrafts = new Map();
		drafts.set(sessionId, sessionDrafts);
	}

	const draft: Draft = {
		userId,
		userName,
		content,
		updatedAt: Date.now(),
	};

	sessionDrafts.set(userId, draft);

	// Clean up stale drafts
	cleanupStaleDrafts(sessionId);

	// Notify all subscribers
	const subs = subscribers.get(sessionId);
	if (subs) {
		for (const callback of subs) {
			callback(draft);
		}
	}

	return draft;
}

/**
 * Get all drafts for a session (excluding the requesting user optionally)
 */
export function getDrafts({
	sessionId,
	excludeUserId,
}: {
	sessionId: string;
	excludeUserId?: string;
}): Draft[] {
	const sessionDrafts = drafts.get(sessionId);
	if (!sessionDrafts) {
		return [];
	}

	// Clean up stale drafts first
	cleanupStaleDrafts(sessionId);

	const result: Draft[] = [];
	for (const [userId, draft] of sessionDrafts.entries()) {
		if (excludeUserId && userId === excludeUserId) {
			continue;
		}
		// Only include drafts with content
		if (draft.content.trim()) {
			result.push(draft);
		}
	}

	return result;
}

/**
 * Delete a user's draft from a session
 */
export function deleteDraft({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: string;
}): void {
	const sessionDrafts = drafts.get(sessionId);
	if (!sessionDrafts) {
		return;
	}

	const deletedDraft = sessionDrafts.get(userId);
	sessionDrafts.delete(userId);

	// Clean up empty sessions
	if (sessionDrafts.size === 0) {
		drafts.delete(sessionId);
	}

	// Notify subscribers with empty content to signal deletion
	if (deletedDraft) {
		const subs = subscribers.get(sessionId);
		if (subs) {
			const clearDraft: Draft = {
				userId,
				userName: deletedDraft.userName,
				content: "",
				updatedAt: Date.now(),
			};
			for (const callback of subs) {
				callback(clearDraft);
			}
		}
	}
}

/**
 * Subscribe to draft updates for a session
 */
export function subscribeToDrafts(
	sessionId: string,
	callback: (draft: Draft) => void,
): () => void {
	let subs = subscribers.get(sessionId);
	if (!subs) {
		subs = new Set();
		subscribers.set(sessionId, subs);
	}

	subs.add(callback);

	// Return unsubscribe function
	return () => {
		subs?.delete(callback);
		if (subs?.size === 0) {
			subscribers.delete(sessionId);
		}
	};
}

/**
 * Remove stale drafts from a session
 */
function cleanupStaleDrafts(sessionId: string): void {
	const sessionDrafts = drafts.get(sessionId);
	if (!sessionDrafts) {
		return;
	}

	const now = Date.now();
	const staleUserIds: string[] = [];

	for (const [userId, draft] of sessionDrafts.entries()) {
		if (now - draft.updatedAt > DRAFT_TIMEOUT_MS) {
			staleUserIds.push(userId);
		}
	}

	for (const userId of staleUserIds) {
		sessionDrafts.delete(userId);
	}

	// Clean up empty sessions
	if (sessionDrafts.size === 0) {
		drafts.delete(sessionId);
	}
}

/**
 * Get draft statistics
 */
export function getDraftStats(): {
	totalSessions: number;
	totalDrafts: number;
	totalSubscribers: number;
} {
	let totalDrafts = 0;
	for (const sessionDrafts of drafts.values()) {
		totalDrafts += sessionDrafts.size;
	}

	let totalSubscribers = 0;
	for (const subs of subscribers.values()) {
		totalSubscribers += subs.size;
	}

	return {
		totalSessions: drafts.size,
		totalDrafts,
		totalSubscribers,
	};
}
