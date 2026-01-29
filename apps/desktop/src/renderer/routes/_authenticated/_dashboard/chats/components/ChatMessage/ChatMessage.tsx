/**
 * Individual chat message component
 */

import type { BetaContentBlock, ToolResult } from "@superset/ai-chat/stream";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ToolCallPart } from "../ToolCallPart";

export interface ChatMessageProps {
	role?: "user" | "assistant";
	content: string;
	contentBlocks?: BetaContentBlock[];
	toolResults?: Map<string, ToolResult>;
	timestamp?: Date;
	isStreaming?: boolean;
}

function ThinkingBlock({ thinking }: { thinking: string }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
				<LuChevronRight
					className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
				/>
				Thinking
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1 rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground italic whitespace-pre-wrap">
					{thinking}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function AssistantContent({
	content,
	contentBlocks,
	toolResults,
}: {
	content: string;
	contentBlocks?: BetaContentBlock[];
	toolResults?: Map<string, ToolResult>;
}) {
	if (!contentBlocks || contentBlocks.length === 0) {
		return (
			<div className="prose prose-sm dark:prose-invert max-w-none">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeRaw, rehypeSanitize]}
				>
					{content}
				</ReactMarkdown>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{contentBlocks.map((block, index) => {
				const key = `${block.type}-${index}`;
				switch (block.type) {
					case "text":
						return (
							<div
								key={key}
								className="prose prose-sm dark:prose-invert max-w-none"
							>
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[rehypeRaw, rehypeSanitize]}
								>
									{block.text}
								</ReactMarkdown>
							</div>
						);
					case "tool_use":
						return (
							<ToolCallPart
								key={block.id}
								block={block}
								result={toolResults?.get(block.id)}
							/>
						);
					case "thinking":
						return <ThinkingBlock key={key} thinking={block.thinking} />;
					default:
						return (
							<div
								key={key}
								className="rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground"
							>
								<span className="font-mono">{block.type}</span> block
							</div>
						);
				}
			})}
		</div>
	);
}

export function ChatMessage({
	role = "assistant",
	content,
	contentBlocks,
	toolResults,
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
				)}
			>
				{isUser ? (
					<p className="whitespace-pre-wrap">{content}</p>
				) : (
					<AssistantContent
						content={content}
						contentBlocks={contentBlocks}
						toolResults={toolResults}
					/>
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
