/**
 * Chat View - desktop app chat interface
 *
 * Messages are materialized from the durable stream via useChatSession.
 * This provides persistence and multi-client sync.
 */

import { ChatInput, PresenceBar } from "@superset/ai-chat/components";
import { useChatSession } from "@superset/ai-chat/stream";
import { cn } from "@superset/ui/utils";
import { useCallback, useMemo, useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ChatMessageList,
	type Message,
	type StreamingMessage,
} from "./components/ChatMessageList";

const STREAM_SERVER_URL = "http://localhost:8080";

export interface ChatViewProps {
	sessionId: string;
	className?: string;
}

export function ChatView({ sessionId, className }: ChatViewProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user
		? { userId: session.user.id, name: session.user.name ?? "Unknown" }
		: null;

	// Get messages from the durable stream (single source of truth)
	const { users, messages, streamingMessage, draft, setDraft, sendMessage } =
		useChatSession({
			proxyUrl: STREAM_SERVER_URL,
			sessionId,
			user,
			autoConnect: !!user,
		});

	const startSessionMutation = electronTrpc.aiChat.startSession.useMutation();
	const { data: isActive, refetch: refetchIsActive } =
		electronTrpc.aiChat.isSessionActive.useQuery({ sessionId });

	const handleStartSession = useCallback(async () => {
		await startSessionMutation.mutateAsync({
			sessionId,
			cwd: "/Users/satyapatel/code/superset",
		});
		await refetchIsActive();
	}, [sessionId, startSessionMutation, refetchIsActive]);

	// Send messages directly to the stream - the session manager's stream watcher
	// will detect new messages and trigger Claude processing
	const [isSending, setIsSending] = useState(false);
	const handleSend = useCallback(
		async (content: string) => {
			setIsSending(true);
			setDraft("");
			try {
				await sendMessage(content);
			} finally {
				setIsSending(false);
			}
		},
		[sendMessage, setDraft],
	);

	// Convert MessageRow to ChatMessageList format
	const allMessages = useMemo((): Array<Message | StreamingMessage> => {
		const result: Array<Message | StreamingMessage> = messages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			content: m.content,
			createdAt: m.createdAt,
		}));
		if (streamingMessage) {
			result.push({ type: "streaming", content: streamingMessage.content });
		}
		return result;
	}, [messages, streamingMessage]);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			<PresenceBar viewers={users} typingUsers={[]} />

			<ChatMessageList
				messages={allMessages}
				className="flex-1 min-h-0 overflow-hidden"
			/>

			<div className="border-t border-border p-4">
				{isActive ? (
					<ChatInput
						value={draft}
						onChange={setDraft}
						onSend={handleSend}
						disabled={isSending}
						placeholder="Type a message..."
						buttonVariant="text"
						autoResize={false}
					/>
				) : (
					<div className="flex items-center justify-center gap-4">
						<span className="text-muted-foreground">Session not active</span>
						<button
							type="button"
							onClick={handleStartSession}
							disabled={startSessionMutation.isPending}
							className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
						>
							{startSessionMutation.isPending ? "Starting..." : "Start Session"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
