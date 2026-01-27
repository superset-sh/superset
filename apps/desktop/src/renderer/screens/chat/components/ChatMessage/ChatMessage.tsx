/**
 * Individual chat message component
 */

import { cn } from "@superset/ui/utils";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export interface ChatMessageProps {
	role: "user" | "assistant" | "streaming";
	content: string;
	timestamp?: Date;
	isStreaming?: boolean;
}

export function ChatMessage({
	role,
	content,
	timestamp,
	isStreaming,
}: ChatMessageProps) {
	const isUser = role === "user";

	return (
		<div
			className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
		>
			<div
				className={cn(
					"max-w-[80%] rounded-lg px-4 py-3",
					isUser
						? "bg-primary text-primary-foreground"
						: "bg-muted text-foreground",
					isStreaming && "animate-pulse",
				)}
			>
				{isUser ? (
					<p className="whitespace-pre-wrap">{content}</p>
				) : (
					<div className="prose prose-sm dark:prose-invert max-w-none">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							rehypePlugins={[rehypeRaw, rehypeSanitize]}
						>
							{content}
						</ReactMarkdown>
					</div>
				)}
				{timestamp && (
					<span className="mt-1 block text-xs opacity-60">
						{timestamp.toLocaleTimeString()}
					</span>
				)}
				{isStreaming && (
					<span className="mt-1 inline-block h-4 w-1 animate-pulse bg-current" />
				)}
			</div>
		</div>
	);
}
