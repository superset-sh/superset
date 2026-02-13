import { MessageResponse } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { ChevronDownIcon } from "lucide-react";
import type React from "react";
import { HiMiniChatBubbleLeftRight } from "react-icons/hi2";
import type { AgentCallPart, MessagePart } from "../../types";

interface AgentCallBlockProps {
	part: AgentCallPart;
	isStreaming: boolean;
	renderParts: (opts: {
		parts: MessagePart[];
		isLastAssistant: boolean;
	}) => React.ReactNode[];
}

export function AgentCallBlock({
	part,
	isStreaming,
	renderParts,
}: AgentCallBlockProps) {
	const isRunning = part.status === "running";
	return (
		<Collapsible
			defaultOpen
			className="not-prose my-3 w-full rounded-md border border-border/60 bg-muted/20"
		>
			<CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-3">
				<div className="flex items-center gap-2">
					<HiMiniChatBubbleLeftRight className="size-4 text-muted-foreground" />
					<span className="font-medium text-sm capitalize">
						{part.agentName}
					</span>
					<Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
						{isRunning ? (
							<span className="size-2 animate-pulse rounded-full bg-blue-500" />
						) : (
							<span className="size-2 rounded-full bg-green-500" />
						)}
						{isRunning ? "Running" : "Done"}
					</Badge>
				</div>
				<ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			{part.prompt && (
				<div className="border-t px-3 py-2 text-muted-foreground text-xs italic">
					{part.prompt}
				</div>
			)}
			<CollapsibleContent className="border-t px-3 py-2">
				{part.parts.length > 0
					? renderParts({
							parts: part.parts,
							isLastAssistant: isRunning && isStreaming,
						})
					: // Fallback for DB-hydrated agent calls: render result as markdown
						part.result &&
						!isRunning && (
							<MessageResponse isAnimating={false}>
								{part.result}
							</MessageResponse>
						)}
			</CollapsibleContent>
		</Collapsible>
	);
}
