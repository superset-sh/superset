/**
 * Individual chat message component
 */

"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { Bot, User } from "lucide-react";

export interface ChatMessageProps {
	role: "user" | "assistant";
	content: string;
	creatorName?: string | null;
	creatorImage?: string | null;
	timestamp?: Date;
	className?: string;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function ChatMessage({
	role,
	content,
	creatorName,
	creatorImage,
	timestamp,
	className,
}: ChatMessageProps) {
	const isUser = role === "user";

	return (
		<div
			className={cn(
				"flex gap-3 p-4",
				isUser ? "bg-muted/50" : "bg-background",
				className,
			)}
		>
			{/* Avatar */}
			<div className="shrink-0">
				{isUser ? (
					<Avatar className="h-8 w-8">
						{creatorImage && <AvatarImage src={creatorImage} />}
						<AvatarFallback className="text-xs">
							{creatorName ? (
								getInitials(creatorName)
							) : (
								<User className="h-4 w-4" />
							)}
						</AvatarFallback>
					</Avatar>
				) : (
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
						<Bot className="h-4 w-4" />
					</div>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<div className="mb-1 flex items-center gap-2">
					<span className="text-sm font-medium">
						{isUser ? (creatorName ?? "You") : "Claude"}
					</span>
					{timestamp && (
						<span className="text-xs text-muted-foreground">
							{timestamp.toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					)}
				</div>
				<div className="prose prose-sm dark:prose-invert max-w-none">
					{/* Simple text rendering - markdown support can be added later */}
					<p className="whitespace-pre-wrap break-words">{content}</p>
				</div>
			</div>
		</div>
	);
}
