"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { ToolCall } from "./tool-call";

export type ExploringGroupItem = {
	icon: ComponentType<{ className?: string }>;
	title: string;
	subtitle?: string;
	isPending: boolean;
	isError: boolean;
	onClick?: () => void;
};

export type ExploringGroupProps = {
	items: ExploringGroupItem[];
	isStreaming: boolean;
	className?: string;
};

const MAX_VISIBLE_TOOLS = 5;
const TOOL_HEIGHT_PX = 24;

function buildSummary(items: ExploringGroupItem[]): string {
	let files = 0;
	let searches = 0;
	for (const item of items) {
		if (/read|glob|explor|found.*file/i.test(item.title)) {
			files++;
		} else {
			searches++;
		}
	}
	const parts: string[] = [];
	if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
	if (searches > 0)
		parts.push(`${searches} ${searches === 1 ? "search" : "searches"}`);
	return parts.join(" ");
}

export const ExploringGroup = ({
	items,
	isStreaming,
	className,
}: ExploringGroupProps) => {
	const [isExpanded, setIsExpanded] = useState(isStreaming);
	const scrollRef = useRef<HTMLDivElement>(null);
	const wasStreamingRef = useRef(isStreaming);

	// Auto-collapse when streaming ends (transition from true -> false)
	useEffect(() => {
		if (wasStreamingRef.current && !isStreaming) {
			setIsExpanded(false);
		}
		wasStreamingRef.current = isStreaming;
	}, [isStreaming]);

	// Auto-scroll to bottom while streaming and when new items arrive
	// biome-ignore lint/correctness/useExhaustiveDependencies: items.length triggers scroll on new items
	useEffect(() => {
		if (isStreaming && isExpanded && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [isStreaming, isExpanded, items.length]);

	const summary = buildSummary(items);

	return (
		<div className={className}>
			{/* Header - clickable to toggle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: interactive group header */}
			<div
				className="group flex cursor-pointer items-start gap-1.5 py-0.5"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="min-w-0 flex flex-1 items-center gap-1">
					<div className="flex min-w-0 items-center gap-1.5 text-xs">
						<span className="shrink-0 whitespace-nowrap font-medium text-muted-foreground">
							{isStreaming ? "Exploring" : "Explored"}
						</span>
						<span className="shrink-0 whitespace-nowrap text-muted-foreground/60">
							{summary}
						</span>
						<ChevronRightIcon
							className={cn(
								"h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out",
								isExpanded && "rotate-90",
								!isExpanded && "opacity-0 group-hover:opacity-100",
							)}
						/>
					</div>
				</div>
			</div>

			{/* Tools list */}
			{isExpanded && (
				<div className="relative mt-1">
					{/* Top gradient fade when streaming and many items */}
					<div
						className={cn(
							"pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-background to-transparent transition-opacity duration-200",
							isStreaming && items.length > MAX_VISIBLE_TOOLS
								? "opacity-100"
								: "opacity-0",
						)}
					/>

					{/* Scrollable container */}
					<div
						className={cn(
							"space-y-1.5",
							items.length > MAX_VISIBLE_TOOLS &&
								"overflow-y-auto scrollbar-hide",
						)}
						ref={scrollRef}
						style={
							items.length > MAX_VISIBLE_TOOLS
								? { maxHeight: `${MAX_VISIBLE_TOOLS * TOOL_HEIGHT_PX}px` }
								: undefined
						}
					>
						{items.map((item, i) => (
							<ToolCall
								icon={item.icon}
								isError={item.isError}
								isPending={item.isPending}
								key={`${item.title}-${i}`}
								onClick={item.onClick}
								subtitle={item.subtitle}
								title={item.title}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
};
