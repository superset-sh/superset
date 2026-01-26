/**
 * Combined hook for multiplayer AI chat
 *
 * Combines:
 * - Completed messages from database (via callback)
 * - Live streaming tokens from Durable Stream
 * - Presence tracking
 */

import { useCallback, useMemo, useState } from "react";
import type { ChatMessage, PresenceUser, StreamEvent } from "../types";
import { useDurableStream } from "./useDurableStream";
import { usePresence } from "./usePresence";

interface UseMultiplayerChatOptions {
	/** Base URL of the durable stream server */
	streamServerUrl: string;
	/** Current user info */
	user: { userId: string; name: string } | null;
	/** Completed messages from database */
	messages: ChatMessage[];
	/** Callback to send a user message */
	onSendMessage: (content: string) => Promise<void>;
	/** Whether the session is active */
	enabled?: boolean;
}

interface UseMultiplayerChatResult {
	/** All messages (completed + streaming) */
	allMessages: Array<ChatMessage | { type: "streaming"; content: string }>;
	/** Send a message */
	sendMessage: (content: string) => Promise<void>;
	/** Users currently viewing */
	viewers: PresenceUser[];
	/** Users currently typing */
	typingUsers: PresenceUser[];
	/** Set typing status */
	setTyping: (isTyping: boolean) => void;
	/** Whether currently streaming a response */
	isStreaming: boolean;
	/** Current streaming content */
	streamingContent: string;
	/** Whether connected to stream */
	isConnected: boolean;
	/** Clear streaming state */
	clearStreaming: () => void;
	/** Stream events (for debugging/advanced use) */
	streamEvents: StreamEvent[];
}

export function useMultiplayerChat(
	sessionId: string | null,
	options: UseMultiplayerChatOptions,
): UseMultiplayerChatResult {
	const {
		streamServerUrl,
		user,
		messages,
		onSendMessage,
		enabled = true,
	} = options;

	const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);

	// Subscribe to durable stream for live tokens
	const {
		streamingContent,
		isConnected,
		isStreaming,
		clear: clearStreaming,
	} = useDurableStream(sessionId, {
		baseUrl: streamServerUrl,
		enabled,
		onEvent: useCallback((event: StreamEvent) => {
			setStreamEvents((prev) => [...prev, event]);
		}, []),
	});

	// Track presence
	const { viewers, typingUsers, setTyping } = usePresence(sessionId, {
		baseUrl: streamServerUrl,
		user,
		enabled,
	});

	// Combine completed messages with streaming content
	const allMessages = useMemo(() => {
		const result: Array<ChatMessage | { type: "streaming"; content: string }> =
			[...messages];

		// Add streaming message if we have content
		if (isStreaming && streamingContent) {
			result.push({
				type: "streaming",
				content: streamingContent,
			});
		}

		return result;
	}, [messages, isStreaming, streamingContent]);

	// Send message with typing indicator
	const sendMessage = useCallback(
		async (content: string) => {
			setTyping(false);
			clearStreaming();
			setStreamEvents([]);
			await onSendMessage(content);
		},
		[onSendMessage, setTyping, clearStreaming],
	);

	return {
		allMessages,
		sendMessage,
		viewers,
		typingUsers,
		setTyping,
		isStreaming,
		streamingContent,
		isConnected,
		clearStreaming,
		streamEvents,
	};
}
