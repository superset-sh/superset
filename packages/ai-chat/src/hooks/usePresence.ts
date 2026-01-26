/**
 * Hook for real-time presence syncing using StreamDB
 *
 * Syncs presence state across users in a chat session using TanStack DB collections
 * backed by Durable Streams.
 */

import { DurableStream } from "@durable-streams/client";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamDB } from "@durable-streams/state";
import type { SessionStateSchema } from "../stream/schema";

interface UsePresenceOptions {
	/** StreamDB instance from useStreamDB */
	db: StreamDB<SessionStateSchema> | null;
	/** Whether the StreamDB is connected and ready */
	isDbConnected?: boolean;
	/** Base URL of the durable stream server */
	baseUrl: string;
	/** Current user info */
	user: { userId: string; name: string } | null;
	/** Device identifier (optional, defaults to generated) */
	deviceId?: string;
	/** Whether presence is enabled */
	enabled?: boolean;
	/** Heartbeat interval in ms (default: 10000) */
	heartbeatInterval?: number;
}

interface PresenceUserResult {
	userId: string;
	name: string;
	userName: string;
	deviceId: string;
	image?: string;
}

interface UsePresenceResult {
	/** Users currently viewing the session (online or idle) */
	viewers: Array<PresenceUserResult & { status: "online" | "typing" | "idle" | "offline" }>;
	/** Users currently typing */
	typingUsers: PresenceUserResult[];
	/** Set current user's typing status */
	setTyping: (isTyping: boolean) => void;
	/** Whether connected to the stream */
	isConnected: boolean;
}

// Generate a stable device ID for this browser session
const generateDeviceId = () => {
	if (typeof window === "undefined") return "server";
	let deviceId = sessionStorage.getItem("__presence_device_id");
	if (!deviceId) {
		deviceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		sessionStorage.setItem("__presence_device_id", deviceId);
	}
	return deviceId;
};

export function usePresence(
	sessionId: string | null,
	options: UsePresenceOptions,
): UsePresenceResult {
	const {
		db,
		isDbConnected = false,
		baseUrl,
		user,
		deviceId = generateDeviceId(),
		enabled = true,
		heartbeatInterval = 10_000,
	} = options;

	const [isConnected, setIsConnected] = useState(false);
	const isTypingRef = useRef(false);
	const streamRef = useRef<DurableStream | null>(null);
	const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Create stream handle for writing
	useEffect(() => {
		if (!sessionId || !baseUrl) {
			streamRef.current = null;
			return;
		}

		const url = `${baseUrl}/streams/${sessionId}`;
		streamRef.current = new DurableStream({ url });
		setIsConnected(true);

		return () => {
			streamRef.current = null;
			setIsConnected(false);
		};
	}, [sessionId, baseUrl]);

	// Query presence from the collection (only when db is connected)
	const presenceQuery = useLiveQuery(
		(q) => {
			if (!isDbConnected || !db?.collections.presence) return null;
			return q.from({ presence: db.collections.presence });
		},
		[db, isDbConnected],
	);

	// Filter for online/typing viewers (not self)
	const viewers = useMemo(() => {
		if (!presenceQuery?.data || !user) return [];
		return presenceQuery.data
			.filter((p) => p.status !== "offline")
			.map((p) => ({
				userId: p.userId,
				name: p.userName, // alias for backwards compat
				userName: p.userName,
				deviceId: p.deviceId,
				status: p.status,
			}));
	}, [presenceQuery?.data, user]);

	// Filter for typing users (excluding self)
	const typingUsers = useMemo(() => {
		if (!presenceQuery?.data || !user) return [];
		return presenceQuery.data
			.filter((p) => p.status === "typing" && p.userId !== user.userId)
			.map((p) => ({
				userId: p.userId,
				name: p.userName, // alias for backwards compat
				userName: p.userName,
				deviceId: p.deviceId,
			}));
	}, [presenceQuery?.data, user]);

	// Sync presence to stream
	const syncPresence = useCallback(
		async (status: "online" | "typing" | "idle" | "offline") => {
			if (!sessionId || !user || !enabled || !streamRef.current) return;

			try {
				const event = {
					type: "presence",
					key: `${user.userId}:${deviceId}`,
					value: {
						userId: user.userId,
						userName: user.name,
						deviceId,
						status,
						lastSeen: new Date().toISOString(),
					},
					headers: {
						operation: status === "offline" ? "delete" : "upsert",
					},
				};

				await streamRef.current.append(JSON.stringify([event]));
			} catch (error) {
				console.error(`[usePresence] Failed to sync presence:`, error);
			}
		},
		[sessionId, user, deviceId, enabled],
	);

	// Set typing status
	const setTyping = useCallback(
		(isTyping: boolean) => {
			if (isTypingRef.current === isTyping) return;
			isTypingRef.current = isTyping;
			syncPresence(isTyping ? "typing" : "online");
		},
		[syncPresence],
	);

	// Initial presence and heartbeat
	useEffect(() => {
		if (!sessionId || !user || !enabled) return;

		// Announce presence
		syncPresence("online");

		// Heartbeat to keep presence alive
		heartbeatRef.current = setInterval(() => {
			syncPresence(isTypingRef.current ? "typing" : "online");
		}, heartbeatInterval);

		return () => {
			// Leave on cleanup
			syncPresence("offline");

			if (heartbeatRef.current) {
				clearInterval(heartbeatRef.current);
				heartbeatRef.current = null;
			}
		};
	}, [sessionId, user, enabled, heartbeatInterval, syncPresence]);

	return {
		viewers,
		typingUsers,
		setTyping,
		isConnected,
	};
}
