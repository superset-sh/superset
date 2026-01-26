/**
 * Hook for real-time draft syncing using StreamDB
 *
 * Syncs draft content across users in a chat session using TanStack DB collections
 * backed by Durable Streams.
 */

import { DurableStream } from "@durable-streams/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamDB } from "@durable-streams/state";
import type { SessionStateSchema } from "../stream/schema";

interface UseDraftOptions {
	/** StreamDB instance from useStreamDB */
	db: StreamDB<SessionStateSchema> | null;
	/** Whether the StreamDB is connected and ready */
	isDbConnected?: boolean;
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
	/** Set content (debounced sync to stream) */
	setContent: (content: string) => void;
	/** Clear draft */
	clear: () => void;
	/** Other users' drafts from the collection */
	otherDrafts: Array<{
		userId: string;
		userName: string;
		content: string;
		updatedAt: string;
	}>;
	/** Whether currently syncing to server */
	isSyncing: boolean;
}

export function useDraft(
	sessionId: string | null,
	options: UseDraftOptions,
): UseDraftResult {
	const {
		db,
		isDbConnected = false,
		baseUrl,
		user,
		enabled = true,
		debounceMs = 50,
	} = options;

	const [content, setContentState] = useState("");
	const [isSyncing, setIsSyncing] = useState(false);

	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSyncedContentRef = useRef("");
	const streamRef = useRef<DurableStream | null>(null);

	// Create stream handle for writing
	useEffect(() => {
		if (!sessionId || !baseUrl) {
			streamRef.current = null;
			return;
		}

		const url = `${baseUrl}/streams/${sessionId}`;
		streamRef.current = new DurableStream({ url });

		return () => {
			streamRef.current = null;
		};
	}, [sessionId, baseUrl]);

	// Query other users' drafts from the collection (only when db is connected)
	const draftsQuery = useLiveQuery(
		(q) => {
			if (!isDbConnected || !db?.collections.drafts) return null;
			return q.from({ draft: db.collections.drafts });
		},
		[db, isDbConnected],
	);

	// Filter out current user's draft
	const otherDrafts = useMemo(() => {
		if (!draftsQuery?.data || !user) return [];
		return draftsQuery.data
			.filter((d) => d.userId !== user.userId && d.content.trim())
			.map((d) => ({
				userId: d.userId,
				userName: d.userName,
				content: d.content,
				updatedAt: d.updatedAt,
			}));
	}, [draftsQuery?.data, user]);

	// Sync draft to stream
	const syncDraft = useCallback(
		async (draftContent: string) => {
			if (!sessionId || !user || !enabled || !streamRef.current) return;

			// Skip if content hasn't changed
			if (draftContent === lastSyncedContentRef.current) return;

			lastSyncedContentRef.current = draftContent;
			setIsSyncing(true);

			try {
				// Append draft event to the stream
				const event = {
					type: "draft",
					key: user.userId,
					value: {
						userId: user.userId,
						userName: user.name,
						content: draftContent,
						updatedAt: new Date().toISOString(),
					},
					headers: {
						operation: draftContent ? "upsert" : "delete",
					},
				};

				await streamRef.current.append(JSON.stringify([event]));
			} catch (error) {
				console.error(`[useDraft] Failed to sync draft:`, error);
			} finally {
				setIsSyncing(false);
			}
		},
		[sessionId, user, enabled],
	);

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
			}, debounceMs);
		},
		[syncDraft, debounceMs],
	);

	// Clear draft
	const clear = useCallback(() => {
		setContentState("");
		lastSyncedContentRef.current = "";

		// Clear any pending debounce
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}

		// Sync empty draft (delete)
		syncDraft("");
	}, [syncDraft]);

	// Reset state when sessionId changes
	useEffect(() => {
		setContentState("");
		lastSyncedContentRef.current = "";
	}, [sessionId]);

	// Cleanup
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	return {
		content,
		setContent,
		clear,
		otherDrafts,
		isSyncing,
	};
}
