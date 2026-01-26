/**
 * Chat room
 */

"use client";

import { ChatInput, PresenceBar } from "@superset/ai-chat/components";
import { useChatSession } from "@superset/ai-chat/stream";
import { authClient } from "@superset/auth/client";
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
	const streamUrl = env.NEXT_PUBLIC_DURABLE_STREAM_URL ?? "";

	const { data: session } = authClient.useSession();
	const user = session?.user
		? { userId: session.user.id, name: session.user.name ?? "Unknown" }
		: null;

	const { users, draft, setDraft } = useChatSession({
		proxyUrl: streamUrl,
		sessionId,
		user,
		autoConnect: !!user && !!streamUrl,
	});

	const messagesQuery = useQuery(
		trpc.chat.getMessages.queryOptions({ sessionId }),
	);

	const sendMessageMutation = useMutation(
		trpc.chat.sendMessage.mutationOptions({
			onSuccess: () => messagesQuery.refetch(),
		}),
	);

	const messages: Message[] = useMemo(() => {
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

	const allMessages: ChatMessageItem[] = messages;

	const handleSend = useCallback(
		async (content: string) => {
			setDraft("");
			await sendMessageMutation.mutateAsync({ sessionId, content });
		},
		[sessionId, sendMessageMutation, setDraft],
	);

	return (
		<div className="flex flex-col h-[calc(100vh-16rem)] border border-border rounded-lg overflow-hidden">
			<PresenceBar viewers={users} typingUsers={[]} />
			<ChatMessageList messages={allMessages} className="flex-1" />
			<div className="border-t border-border p-4">
				<ChatInput
					value={draft}
					onChange={setDraft}
					onSend={handleSend}
					disabled={sendMessageMutation.isPending}
					placeholder={
						sendMessageMutation.isPending ? "Sending..." : "Type a message..."
					}
				/>
			</div>
		</div>
	);
}
