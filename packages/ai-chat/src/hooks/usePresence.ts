/**
 * Hook for managing presence in a chat session
 *
 * Tracks who's viewing and typing in a session.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PresenceState, PresenceUser } from "../types";

interface UsePresenceOptions {
	/** Base URL of the durable stream server */
	baseUrl: string;
	/** Current user info */
	user: { userId: string; name: string } | null;
	/** Whether presence is enabled */
	enabled?: boolean;
	/** Heartbeat interval in ms (default: 10000) */
	heartbeatInterval?: number;
	/** Presence poll interval in ms (default: 5000) */
	pollInterval?: number;
}

interface UsePresenceResult {
	/** Users currently viewing the session */
	viewers: PresenceUser[];
	/** Users currently typing */
	typingUsers: PresenceUser[];
	/** Set current user's typing status */
	setTyping: (isTyping: boolean) => void;
	/** Whether presence is connected */
	isConnected: boolean;
}

export function usePresence(
	sessionId: string | null,
	options: UsePresenceOptions,
): UsePresenceResult {
	const {
		baseUrl,
		user,
		enabled = true,
		heartbeatInterval = 10_000,
		pollInterval = 5_000,
	} = options;

	const [presence, setPresence] = useState<PresenceState>({
		viewers: [],
		typingUsers: [],
	});
	const [isConnected, setIsConnected] = useState(false);

	const isTypingRef = useRef(false);
	const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Update presence on the server
	const updatePresence = useCallback(
		async (isTyping: boolean) => {
			if (!sessionId || !user || !enabled) return;

			try {
				await fetch(`${baseUrl}/streams/${sessionId}/presence`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						userId: user.userId,
						name: user.name,
						isTyping,
					}),
				});
				setIsConnected(true);
			} catch (error) {
				console.error(`[usePresence] Failed to update presence:`, error);
				setIsConnected(false);
			}
		},
		[sessionId, baseUrl, user, enabled],
	);

	// Fetch presence state from the server
	const fetchPresence = useCallback(async () => {
		if (!sessionId || !enabled) return;

		try {
			const response = await fetch(`${baseUrl}/streams/${sessionId}/presence`);
			if (response.ok) {
				const data = (await response.json()) as PresenceState;
				setPresence(data);
				setIsConnected(true);
			}
		} catch (error) {
			console.error(`[usePresence] Failed to fetch presence:`, error);
			setIsConnected(false);
		}
	}, [sessionId, baseUrl, enabled]);

	// Set typing status
	const setTyping = useCallback(
		(isTyping: boolean) => {
			if (isTypingRef.current !== isTyping) {
				isTypingRef.current = isTyping;
				updatePresence(isTyping);
			}
		},
		[updatePresence],
	);

	// Setup heartbeat and polling
	useEffect(() => {
		if (!sessionId || !user || !enabled) return;

		// Initial presence update
		updatePresence(false);
		fetchPresence();

		// Heartbeat to keep presence alive
		heartbeatIntervalRef.current = setInterval(() => {
			updatePresence(isTypingRef.current);
		}, heartbeatInterval);

		// Poll for presence updates
		pollIntervalRef.current = setInterval(() => {
			fetchPresence();
		}, pollInterval);

		return () => {
			// Leave session
			if (user) {
				fetch(`${baseUrl}/streams/${sessionId}/presence/${user.userId}`, {
					method: "DELETE",
				}).catch(() => {
					// Ignore errors on cleanup
				});
			}

			if (heartbeatIntervalRef.current) {
				clearInterval(heartbeatIntervalRef.current);
				heartbeatIntervalRef.current = null;
			}
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}
		};
	}, [
		sessionId,
		user,
		enabled,
		baseUrl,
		heartbeatInterval,
		pollInterval,
		updatePresence,
		fetchPresence,
	]);

	return {
		viewers: presence.viewers,
		typingUsers: presence.typingUsers,
		setTyping,
		isConnected,
	};
}
