/**
 * Scrollable message list with auto-scroll
 */

"use client";

import { cn } from "@superset/ui/utils";
import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";
import { ChatMessage } from "../ChatMessage";

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	creatorName?: string | null;
	creatorImage?: string | null;
	createdAt: Date;
}

export interface StreamingMessage {
	type: "streaming";
	content: string;
}

export type ChatMessageItem = Message | StreamingMessage;

export interface ChatMessageListProps {
	messages: ChatMessageItem[];
	className?: string;
}

function isStreamingMessage(
	message: ChatMessageItem,
): message is StreamingMessage {
	return "type" in message && message.type === "streaming";
}

export function ChatMessageList({ messages, className }: ChatMessageListProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when messages change
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	if (messages.length === 0) {
		return (
			<div
				className={cn(
					"flex flex-1 items-center justify-center text-muted-foreground",
					className,
				)}
			>
				<div className="text-center">
					<p className="text-sm">No messages yet</p>
					<p className="text-xs mt-1">
						Send a message to start the conversation
					</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className={cn("flex-1 overflow-y-auto", className)}>
			{messages.map((message) => {
				if (isStreamingMessage(message)) {
					return (
						<div key="streaming" className="flex gap-3 p-4 bg-background">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
								<Bot className="h-4 w-4" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="mb-1 flex items-center gap-2">
									<span className="text-sm font-medium">Claude</span>
									<span className="flex gap-0.5">
										<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
										<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
										<span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
									</span>
								</div>
								<div className="prose prose-sm dark:prose-invert max-w-none">
									<p className="whitespace-pre-wrap break-words">
										{message.content || "Thinking..."}
									</p>
								</div>
							</div>
						</div>
					);
				}

				return (
					<ChatMessage
						key={message.id}
						role={message.role}
						content={message.content}
						creatorName={message.creatorName}
						creatorImage={message.creatorImage}
						timestamp={message.createdAt}
					/>
				);
			})}
			<div ref={bottomRef} />
		</div>
	);
}
