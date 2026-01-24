/**
 * Presence state management
 *
 * Tracks who's viewing and typing in each chat session.
 */

import type { PresenceState, PresenceUser } from "./types";

// In-memory presence state
const presenceStates = new Map<string, PresenceState>();

// Timeout for considering a user offline (30 seconds)
const PRESENCE_TIMEOUT_MS = 30_000;

// Typing indicator timeout (5 seconds)
const TYPING_TIMEOUT_MS = 5_000;

/**
 * Update a user's presence in a session
 */
export function updatePresence({
	sessionId,
	userId,
	name,
	isTyping = false,
}: {
	sessionId: string;
	userId: string;
	name: string;
	isTyping?: boolean;
}): PresenceState {
	let state = presenceStates.get(sessionId);
	if (!state) {
		state = {
			sessionId,
			users: new Map(),
		};
		presenceStates.set(sessionId, state);
	}

	const user: PresenceUser = {
		userId,
		name,
		isTyping,
		lastSeen: Date.now(),
	};

	state.users.set(userId, user);

	// Clean up stale users
	cleanupStaleUsers(state);

	return state;
}

/**
 * Remove a user from a session's presence
 */
export function removePresence({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: string;
}): void {
	const state = presenceStates.get(sessionId);
	if (state) {
		state.users.delete(userId);

		// Clean up empty sessions
		if (state.users.size === 0) {
			presenceStates.delete(sessionId);
		}
	}
}

/**
 * Get presence state for a session
 */
export function getPresence(sessionId: string): {
	viewers: Array<{ userId: string; name: string }>;
	typingUsers: Array<{ userId: string; name: string }>;
} {
	const state = presenceStates.get(sessionId);
	if (!state) {
		return { viewers: [], typingUsers: [] };
	}

	// Clean up stale users
	cleanupStaleUsers(state);

	const now = Date.now();
	const viewers: Array<{ userId: string; name: string }> = [];
	const typingUsers: Array<{ userId: string; name: string }> = [];

	for (const user of state.users.values()) {
		viewers.push({ userId: user.userId, name: user.name });

		// Only show typing if recently updated
		if (user.isTyping && now - user.lastSeen < TYPING_TIMEOUT_MS) {
			typingUsers.push({ userId: user.userId, name: user.name });
		}
	}

	return { viewers, typingUsers };
}

/**
 * Set typing status for a user
 */
export function setTyping({
	sessionId,
	userId,
	isTyping,
}: {
	sessionId: string;
	userId: string;
	isTyping: boolean;
}): void {
	const state = presenceStates.get(sessionId);
	if (!state) return;

	const user = state.users.get(userId);
	if (user) {
		user.isTyping = isTyping;
		user.lastSeen = Date.now();
	}
}

/**
 * Remove stale users from presence state
 */
function cleanupStaleUsers(state: PresenceState): void {
	const now = Date.now();
	const staleUserIds: string[] = [];

	for (const [userId, user] of state.users.entries()) {
		if (now - user.lastSeen > PRESENCE_TIMEOUT_MS) {
			staleUserIds.push(userId);
		}
	}

	for (const userId of staleUserIds) {
		state.users.delete(userId);
	}

	// Clean up empty sessions
	if (state.users.size === 0) {
		presenceStates.delete(state.sessionId);
	}
}

/**
 * Get presence statistics
 */
export function getPresenceStats(): {
	totalSessions: number;
	totalUsers: number;
} {
	let totalUsers = 0;
	for (const state of presenceStates.values()) {
		totalUsers += state.users.size;
	}

	return {
		totalSessions: presenceStates.size,
		totalUsers,
	};
}
