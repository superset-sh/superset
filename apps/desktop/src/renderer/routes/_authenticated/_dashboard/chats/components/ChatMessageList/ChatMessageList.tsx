/**
 * Chat message list with auto-scroll
 */

import type { BetaContentBlock, ToolResult } from "@superset/ai-chat/stream";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { ChatMessage } from "../ChatMessage";

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	contentBlocks?: BetaContentBlock[];
	toolResults?: Map<string, ToolResult>;
	createdAt: Date;
}

export interface StreamingMessage {
	type: "streaming";
	content: string;
	contentBlocks?: BetaContentBlock[];
	toolResults?: Map<string, ToolResult>;
}

export interface ChatMessageListProps {
	messages: Array<Message | StreamingMessage>;
	className?: string;
	autoScroll?: boolean;
}

export function ChatMessageList({
	messages,
	className,
	autoScroll = true,
}: ChatMessageListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (autoScroll && bottomRef.current) {
			bottomRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [autoScroll]);

	return (
		<ScrollArea className={cn("flex-1", className)}>
			<div ref={scrollRef} className="flex flex-col gap-4 p-4">
				{messages.map((msg, index) => {
					if ("type" in msg && msg.type === "streaming") {
						return (
							<ChatMessage
								key="streaming"
								content={msg.content}
								contentBlocks={msg.contentBlocks}
								toolResults={msg.toolResults}
								isStreaming
							/>
						);
					}

					const message = msg as Message;
					return (
						<ChatMessage
							key={message.id || index}
							role={message.role}
							content={message.content}
							contentBlocks={message.contentBlocks}
							toolResults={message.toolResults}
							timestamp={message.createdAt}
						/>
					);
				})}
				<div ref={bottomRef} />
			</div>
		</ScrollArea>
	);
}
