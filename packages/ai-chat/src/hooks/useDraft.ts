/**
 * Hook for real-time draft syncing
 *
 * Syncs draft content across users in a chat session with ~50ms latency.
 * Uses debounced POST for updates and SSE for receiving other users' drafts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "../types";

interface UseDraftOptions {
	/** Base URL of the durable stream server */
	baseUrl: string;
	/** Current user info */
	user: { userId: string; name: string } | null;
	/** Whether draft sync is enabled */
	enabled?: boolean;
	/** Debounce delay in ms (default: 50) */
	debounceMs?: number;
}

interface UseDraftResult {
	/** Local content state for immediate UI */
	content: string;
	/** Set content (debounced POST to server) */
	setContent: (content: string) => void;
	/** Clear draft (DELETE from server) */
	clear: () => void;
	/** Other users' drafts via SSE */
	otherDrafts: Draft[];
	/** Whether currently syncing to server */
	isSyncing: boolean;
	/** Whether connected to SSE */
	isConnected: boolean;
}

export function useDraft(
	sessionId: string | null,
	options: UseDraftOptions,
): UseDraftResult {
	const { baseUrl, user, enabled = true, debounceMs = 50 } = options;

	const [content, setContentState] = useState("");
	const [otherDrafts, setOtherDrafts] = useState<Draft[]>([]);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	// Use refs to avoid recreating callbacks when options change
	const optionsRef = useRef({ baseUrl, user, enabled, debounceMs });
	optionsRef.current = { baseUrl, user, enabled, debounceMs };

	const eventSourceRef = useRef<EventSource | null>(null);
	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const lastSyncedContentRef = useRef("");
	const isConnectingRef = useRef(false);

	// POST draft to server
	const syncDraft = useCallback(async (draftContent: string) => {
		const { baseUrl, user, enabled } = optionsRef.current;
		if (!sessionId || !user || !enabled) return;

		// Skip if content hasn't changed
		if (draftContent === lastSyncedContentRef.current) return;

		lastSyncedContentRef.current = draftContent;
		setIsSyncing(true);

		try {
			await fetch(`${baseUrl}/streams/${sessionId}/draft`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: user.userId,
					userName: user.name,
					content: draftContent,
				}),
			});
		} catch (error) {
			console.error(`[useDraft] Failed to sync draft:`, error);
		} finally {
			setIsSyncing(false);
		}
	}, [sessionId]);

	// Debounced content setter
	const setContent = useCallback(
		(newContent: string) => {
			setContentState(newContent);

			// Clear existing debounce
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			// Schedule sync
			debounceTimeoutRef.current = setTimeout(() => {
				syncDraft(newContent);
			}, optionsRef.current.debounceMs);
		},
		[syncDraft],
	);

	// Clear draft (on send or blur)
	const clear = useCallback(() => {
		const { baseUrl, user, enabled } = optionsRef.current;
		setContentState("");
		lastSyncedContentRef.current = "";

		// Clear any pending debounce
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}

		// DELETE from server
		if (sessionId && user && enabled) {
			fetch(`${baseUrl}/streams/${sessionId}/draft/${user.userId}`, {
				method: "DELETE",
			}).catch((error) => {
				console.error(`[useDraft] Failed to clear draft:`, error);
			});
		}
	}, [sessionId]);

	// Connect to SSE - defined inside useEffect to avoid dependency issues
	useEffect(() => {
		const { user, enabled } = optionsRef.current;

		if (!sessionId || !user || !enabled) {
			return;
		}

		// Prevent multiple simultaneous connections
		if (isConnectingRef.current) {
			return;
		}

		const connect = () => {
			const currentOptions = optionsRef.current;
			if (!currentOptions.user || !currentOptions.enabled) return;

			// Close existing connection
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}

			isConnectingRef.current = true;

			const url = `${currentOptions.baseUrl}/streams/${sessionId}/drafts?live=true&excludeUserId=${currentOptions.user.userId}`;
			console.log(`[useDraft] Connecting to ${url}`);

			const eventSource = new EventSource(url);
			eventSourceRef.current = eventSource;

			eventSource.onopen = () => {
				console.log(`[useDraft] Connected`);
				setIsConnected(true);
				isConnectingRef.current = false;
			};

			eventSource.addEventListener("draft", (e) => {
				try {
					const draft = JSON.parse(e.data) as Draft;

					setOtherDrafts((prev) => {
						// Remove existing draft from this user
						const filtered = prev.filter((d) => d.userId !== draft.userId);

						// If content is empty, user cleared their draft
						if (!draft.content.trim()) {
							return filtered;
						}

						// Add/update draft
						return [...filtered, draft];
					});
				} catch (err) {
					console.error(`[useDraft] Failed to parse draft:`, err);
				}
			});

			eventSource.addEventListener("heartbeat", () => {
				// Heartbeat received, connection is alive
			});

			eventSource.onerror = () => {
				console.error(`[useDraft] SSE error`);
				setIsConnected(false);
				isConnectingRef.current = false;

				eventSource.close();
				eventSourceRef.current = null;

				// Reconnect after delay
				if (optionsRef.current.enabled) {
					reconnectTimeoutRef.current = setTimeout(() => {
						console.log(`[useDraft] Reconnecting...`);
						connect();
					}, 2000);
				}
			};
		};

		connect();

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
				debounceTimeoutRef.current = null;
			}
			isConnectingRef.current = false;
			setIsConnected(false);
		};
	}, [sessionId]); // Only reconnect when sessionId changes

	// Reset state when sessionId changes
	useEffect(() => {
		setContentState("");
		setOtherDrafts([]);
		lastSyncedContentRef.current = "";
	}, [sessionId]);

	return {
		content,
		setContent,
		clear,
		otherDrafts,
		isSyncing,
		isConnected,
	};
}
