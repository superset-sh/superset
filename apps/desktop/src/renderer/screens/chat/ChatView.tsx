/**
 * Main Chat View component
 *
 * Combines message list, input, and presence for a complete chat experience.
 */

import { cn } from "@superset/ui/utils";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ChatInput } from "./components/ChatInput";
import { ChatMessageList, type Message, type StreamingMessage } from "./components/ChatMessageList";
import { PresenceBar } from "./components/PresenceBar";

export interface ChatViewProps {
	sessionId: string;
	workspaceId?: string;
	className?: string;
}

export function ChatView({
	sessionId,
	workspaceId,
	className,
}: ChatViewProps) {
	// Subscribe to stream events from the local Claude session
	electronTrpc.aiChat.streamEvents.useSubscription(
		{ sessionId },
		{
			onData: (event) => {
				console.log("[ChatView] Stream event:", event);
				// TODO: Process stream events and update UI
			},
		},
	);

	// Send message mutation
	const sendMessageMutation = electronTrpc.aiChat.sendMessage.useMutation();

	// Check if session is active
	const { data: isActive } = electronTrpc.aiChat.isSessionActive.useQuery(
		{ sessionId },
	);

	// Build messages from stream events
	const { messages, streamingContent, isStreaming } = useMemo(() => {
		// For now, we're using local stream events
		// In the full implementation, completed messages would come from Electric SQL
		const msgs: Message[] = [];
		let content = "";
		let streaming = false;

		// This is a simplified implementation
		// The full version would combine Electric SQL messages with stream events
		return {
			messages: msgs,
			streamingContent: content,
			isStreaming: streaming,
		};
	}, []);

	// Combine messages with streaming
	const allMessages = useMemo((): Array<Message | StreamingMessage> => {
		const result: Array<Message | StreamingMessage> = [...messages];

		if (isStreaming && streamingContent) {
			result.push({
				type: "streaming",
				content: streamingContent,
			});
		}

		return result;
	}, [messages, isStreaming, streamingContent]);

	const handleSend = useCallback(
		async (content: string) => {
			if (!sessionId) return;
			await sendMessageMutation.mutateAsync({ sessionId, content });
		},
		[sessionId, sendMessageMutation],
	);

	const handleTypingChange = useCallback((isTyping: boolean) => {
		// TODO: Update presence typing status
		console.log("[ChatView] Typing:", isTyping);
	}, []);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Presence bar */}
			<PresenceBar
				viewers={[]}
				typingUsers={[]}
			/>

			{/* Messages */}
			<ChatMessageList
				messages={allMessages}
				className="flex-1"
			/>

			{/* Input */}
			<div className="border-t border-border p-4">
				<ChatInput
					onSend={handleSend}
					onTypingChange={handleTypingChange}
					disabled={!isActive || sendMessageMutation.isPending}
					placeholder={
						isActive
							? "Type a message..."
							: "Session not active. Start a session first."
					}
				/>
			</div>
		</div>
	);
}
