/**
 * Chat Session Hook
 *
 * Real-time state for a chat room:
 * - users: who's in the room
 * - messages: materialized from stream chunks
 * - draft: shared draft (like a live doc)
 */

import { createStreamDB, type StreamDB } from "@durable-streams/state";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSessionActions, type SessionUser } from "./actions";
import {
	type ChunkRow,
	type MessageRow,
	materializeMessage,
} from "./materialize";
import { type SessionStateSchema, sessionStateSchema } from "./schema";

export interface UseChatSessionOptions {
	baseUrl: string;
	sessionId: string;
	user: SessionUser | null;
	enabled?: boolean;
}

export interface ChatUser {
	userId: string;
	name: string;
}

export interface UseChatSessionResult {
	users: ChatUser[];
	messages: MessageRow[];
	streamingMessage: MessageRow | null;
	draft: string;
	setDraft: (content: string) => void;
	isLoading: boolean;
}

export function useChatSession({
	baseUrl,
	sessionId,
	user,
	enabled = true,
}: UseChatSessionOptions): UseChatSessionResult {
	const [isConnected, setIsConnected] = useState(false);
	const dbRef = useRef<StreamDB<SessionStateSchema> | null>(null);

	// Create DB
	const db = useMemo(() => {
		if (!enabled || !sessionId) return null;
		const streamDb = createStreamDB({
			streamOptions: { url: `${baseUrl}/streams/${sessionId}` },
			state: sessionStateSchema,
		});
		dbRef.current = streamDb;
		return streamDb;
	}, [baseUrl, sessionId, enabled]);

	// Connect and join
	useEffect(() => {
		if (!db || !user) {
			setIsConnected(false);
			return;
		}

		let cancelled = false;
		const actions = createSessionActions({ baseUrl, sessionId, user });

		db.preload().then(() => {
			if (cancelled) return;
			setIsConnected(true);
			actions.join();
		});

		return () => {
			cancelled = true;
			actions.leave().catch(() => {});
			db.close();
		};
	}, [db, user, baseUrl, sessionId]);

	// Query presence
	const collections = isConnected ? db?.collections : null;
	const { data: presenceData } = useLiveQuery(
		(q) => (collections?.presence ? q.from({ p: collections.presence }) : null),
		[collections],
	);

	// Query drafts
	const { data: draftsData } = useLiveQuery(
		(q) => (collections?.drafts ? q.from({ d: collections.drafts }) : null),
		[collections],
	);

	// Query all chunks for message materialization
	const { data: chunksData } = useLiveQuery(
		(q) => (collections?.chunks ? q.from({ c: collections.chunks }) : null),
		[collections],
	);

	const users = useMemo((): ChatUser[] => {
		if (!presenceData) return [];
		return presenceData.map((p) => ({ userId: p.userId, name: p.userName }));
	}, [presenceData]);

	// Materialize messages from chunks
	const { messages, streamingMessage } = useMemo(() => {
		if (!chunksData?.length) return { messages: [], streamingMessage: null };

		// Group chunks by messageId
		const byMessage = new Map<string, ChunkRow[]>();
		for (const chunk of chunksData) {
			const chunkRow: ChunkRow = { ...chunk, id: chunk.messageId };
			const existing = byMessage.get(chunk.messageId) ?? [];
			existing.push(chunkRow);
			byMessage.set(chunk.messageId, existing);
		}

		// Materialize each message group and sort by first chunk's createdAt
		const all = Array.from(byMessage.values())
			.map((rows) => materializeMessage(rows))
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

		// Separate complete messages from streaming (incomplete) message
		const complete = all.filter((m) => m.isComplete);
		const streaming = all.find((m) => !m.isComplete) ?? null;

		return { messages: complete, streamingMessage: streaming };
	}, [chunksData]);

	// Local draft state - synced from stream on load
	const [localDraft, setLocalDraft] = useState("");
	const [hasHydrated, setHasHydrated] = useState(false);

	// Hydrate draft from stream on initial load
	useEffect(() => {
		if (hasHydrated || !draftsData || !user) return;

		// Find current user's draft
		const myDraft = draftsData.find((d) => d.userId === user.userId);
		if (myDraft?.content) {
			setLocalDraft(myDraft.content);
		}
		setHasHydrated(true);
	}, [draftsData, user, hasHydrated]);

	// Reset hydration flag when session changes
	useEffect(() => {
		setHasHydrated(false);
		setLocalDraft("");
	}, [sessionId]);

	const setDraft = useCallback(
		(content: string) => {
			setLocalDraft(content);
			if (!user) return;
			const actions = createSessionActions({ baseUrl, sessionId, user });
			actions.updateDraft(content).catch(() => {});
		},
		[baseUrl, sessionId, user],
	);

	return {
		users,
		messages,
		streamingMessage,
		draft: localDraft,
		setDraft,
		isLoading: !isConnected,
	};
}
