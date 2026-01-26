/**
 * Chat room - the main interactive chat view for a session.
 *
 * Sends messages via API tRPC and subscribes to Durable Stream for live tokens.
 */

"use client";

import { type PresenceUser, useDurableStream } from "@superset/ai-chat";
import { ChatInput, PresenceBar } from "@superset/ai-chat/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import {
	type ChatMessageItem,
	ChatMessageList,
	type Message,
} from "../../../components/ChatMessageList";

interface ChatRoomProps {
	sessionId: string;
}

export function ChatRoom({ sessionId }: ChatRoomProps) {
	const trpc = useTRPC();

	// Fetch completed messages from the API
	const messagesQuery = useQuery(
		trpc.chat.getMessages.queryOptions({ sessionId }),
	);

	// Subscribe to Durable Stream for live tokens
	const streamUrl = env.NEXT_PUBLIC_DURABLE_STREAM_URL ?? null;
	const { streamingContent, isStreaming } = useDurableStream(
		streamUrl ? sessionId : null,
		{ baseUrl: streamUrl ?? "" },
	);

	// Send message mutation
	const sendMessageMutation = useMutation(
		trpc.chat.sendMessage.mutationOptions({
			onSuccess: () => {
				// Refetch messages after sending
				messagesQuery.refetch();
			},
		}),
	);

	// Transform API messages to component format
	const completedMessages: Message[] = useMemo(() => {
		if (!messagesQuery.data) return [];
		return messagesQuery.data.map((row) => ({
			id: row.message.id,
			role: row.message.role as "user" | "assistant",
			content: row.message.content,
			creatorName: row.creator?.name ?? null,
			creatorImage: row.creator?.image ?? null,
			createdAt: new Date(row.message.createdAt),
		}));
	}, [messagesQuery.data]);

	// Combine completed messages with streaming content
	const allMessages: ChatMessageItem[] = useMemo(() => {
		const result: ChatMessageItem[] = [...completedMessages];

		if (isStreaming && streamingContent) {
			result.push({
				type: "streaming",
				content: streamingContent,
			});
		}

		return result;
	}, [completedMessages, isStreaming, streamingContent]);

	const handleSend = useCallback(
		async (content: string) => {
			await sendMessageMutation.mutateAsync({ sessionId, content });
		},
		[sessionId, sendMessageMutation],
	);

	const handleTypingChange = useCallback((_isTyping: boolean) => {
		// TODO: Update presence typing status via Durable Stream
	}, []);

	// TODO: Get real presence data from Durable Stream
	const viewers: PresenceUser[] = [];
	const typingUsers: PresenceUser[] = [];

	return (
		<div className="flex flex-col h-[calc(100vh-16rem)] border border-border rounded-lg overflow-hidden">
			{/* Presence bar */}
			<PresenceBar viewers={viewers} typingUsers={typingUsers} />

			{/* Messages */}
			<ChatMessageList messages={allMessages} className="flex-1" />

			{/* Input */}
			<div className="border-t border-border p-4">
				<ChatInput
					onSend={handleSend}
					onTypingChange={handleTypingChange}
					disabled={sendMessageMutation.isPending}
					placeholder={
						sendMessageMutation.isPending ? "Sending..." : "Type a message..."
					}
				/>
			</div>
		</div>
	);
}
