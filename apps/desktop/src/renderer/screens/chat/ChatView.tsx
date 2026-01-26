/**
 * Main Chat View component
 *
 * Combines message list, input, and presence for a complete chat experience.
 */

import { useDraft, usePresence } from "@superset/ai-chat";
import { ChatInput, PresenceBar } from "@superset/ai-chat/components";
import { cn } from "@superset/ui/utils";
import { useCallback, useMemo, useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ChatMessageList,
	type Message,
	type StreamingMessage,
} from "./components/ChatMessageList";

// TODO: Make configurable via environment variable for production
const STREAM_SERVER_URL = "http://localhost:8080";

export interface ChatViewProps {
	sessionId: string;
	workspaceId?: string;
	className?: string;
}

export function ChatView({ sessionId, workspaceId, className }: ChatViewProps) {
	// Get current user
	const { data: session } = authClient.useSession();
	const user = session?.user
		? { userId: session.user.id, name: session.user.name ?? "Unknown" }
		: null;

	// Message state
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);

	// Tool use tracking
	interface ActiveToolUse {
		toolId: string;
		toolName: string;
		startTime: Date;
	}
	const [activeToolUses, setActiveToolUses] = useState<ActiveToolUse[]>([]);

	// Subscribe to stream events from the local Claude session
	electronTrpc.aiChat.streamEvents.useSubscription(
		{ sessionId },
		{
			onData: (event) => {
				console.log("[ChatView] Stream event:", event);

				switch (event.type) {
					case "text_delta":
						setIsStreaming(true);
						setStreamingContent((prev) => prev + event.text);
						break;

					case "message_complete":
						// Add assistant message to history
						if (event.content) {
							setMessages((prev) => [
								...prev,
								{
									id: `assistant-${Date.now()}`,
									role: "assistant" as const,
									content: event.content,
									createdAt: new Date(),
								},
							]);
						}
						setStreamingContent("");
						setIsStreaming(false);
						break;

					case "tool_use_start":
						console.log("[ChatView] Tool use start:", event.toolName, event.toolId);
						setActiveToolUses((prev) => [
							...prev,
							{
								toolId: event.toolId,
								toolName: event.toolName,
								startTime: new Date(),
							},
						]);
						break;

					case "tool_use_end":
						console.log("[ChatView] Tool use end:", event.toolId);
						setActiveToolUses((prev) =>
							prev.filter((t) => t.toolId !== event.toolId)
						);
						break;

					case "error":
						console.error("[ChatView] Claude error:", event.error);
						setStreamingContent("");
						setIsStreaming(false);
						setActiveToolUses([]);
						break;

					case "session_end":
						setStreamingContent("");
						setIsStreaming(false);
						setActiveToolUses([]);
						break;
				}
			},
		},
	);

	// Send message mutation
	const sendMessageMutation = electronTrpc.aiChat.sendMessage.useMutation();

	// Check if session is active
	const { data: isActive, refetch: refetchIsActive } =
		electronTrpc.aiChat.isSessionActive.useQuery({
			sessionId,
		});

	// Start session mutation
	const startSessionMutation = electronTrpc.aiChat.startSession.useMutation();

	const handleStartSession = useCallback(async () => {
		// TODO: Get actual workspace path from workspace context/props
		// Currently hardcoded - should come from the workspace being viewed
		await startSessionMutation.mutateAsync({
			sessionId,
			cwd: "/Users/satyapatel/code/superset",
		});
		// Refetch to update UI
		await refetchIsActive();
	}, [sessionId, startSessionMutation, refetchIsActive]);

	// Real-time presence
	const { viewers, typingUsers, setTyping } = usePresence(sessionId, {
		baseUrl: STREAM_SERVER_URL,
		user,
		enabled: !!user,
	});

	// Real-time draft sync
	const {
		content: draftContent,
		setContent: setDraftContent,
		otherDrafts,
		clear: clearDraft,
	} = useDraft(sessionId, {
		baseUrl: STREAM_SERVER_URL,
		user,
		enabled: !!user,
	});

	// Debug logging
	console.log("[ChatView] State:", {
		sessionId,
		isActive,
		user: user?.userId,
		draftContent: draftContent?.slice(0, 20),
	});

	// Combine messages with streaming content
	const allMessages = useMemo((): Array<Message | StreamingMessage> => {
		const result: Array<Message | StreamingMessage> = [...messages];

		if (isStreaming || streamingContent) {
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

			// Add user message to the list immediately
			setMessages((prev) => [
				...prev,
				{
					id: `user-${Date.now()}`,
					role: "user" as const,
					content,
					createdAt: new Date(),
				},
			]);

			clearDraft(); // Clear draft on send
			await sendMessageMutation.mutateAsync({ sessionId, content });
		},
		[sessionId, sendMessageMutation, clearDraft],
	);

	const handleTypingChange = useCallback(
		(isTyping: boolean) => {
			setTyping(isTyping);
		},
		[setTyping],
	);

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Debug info */}
			<div className="text-xs p-2 bg-yellow-100 text-black">
				isActive: {String(isActive)} | user: {user?.userId ?? "null"} | draft: "{draftContent.slice(0, 20)}"
			</div>

			{/* Presence bar with draft previews */}
			<PresenceBar viewers={viewers} typingUsers={typingUsers} />

			{/* Show other users' draft previews */}
			{otherDrafts.length > 0 && (
				<div className="px-4 py-2 bg-muted/30 border-b border-border">
					{otherDrafts.map((draft) => (
						<div key={draft.userId} className="text-sm text-muted-foreground">
							<span className="font-medium">{draft.userName}</span>
							<span className="mx-1">is typing:</span>
							<span className="italic truncate">
								{draft.content.slice(0, 50)}
								{draft.content.length > 50 ? "..." : ""}
							</span>
						</div>
					))}
				</div>
			)}

			{/* Active tool uses */}
			{activeToolUses.length > 0 && (
				<div className="px-4 py-2 bg-blue-50 dark:bg-blue-950 border-b border-border">
					<div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
						Active Tools:
					</div>
					{activeToolUses.map((tool) => (
						<div
							key={tool.toolId}
							className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400"
						>
							<span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
							<span className="font-mono">{tool.toolName}</span>
							<span className="text-xs text-muted-foreground">
								({tool.toolId.slice(0, 8)}...)
							</span>
						</div>
					))}
				</div>
			)}

			{/* Messages */}
			<ChatMessageList messages={allMessages} className="flex-1 min-h-0 overflow-hidden" />

			{/* Input or Start Session */}
			<div className="border-t border-border p-4">
				{isActive ? (
					<ChatInput
						value={draftContent}
						onChange={setDraftContent}
						onSend={handleSend}
						onTypingChange={handleTypingChange}
						disabled={sendMessageMutation.isPending}
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
