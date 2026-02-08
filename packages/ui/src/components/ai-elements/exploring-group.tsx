"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Shimmer } from "./shimmer";
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

function buildSummary(items: ExploringGroupItem[]): string {
	let files = 0;
	let searches = 0;
	for (const item of items) {
		// Heuristic: titles containing "Read", "Glob", "Explored", "Found" → files; others → searches
		if (/read|glob|explor|found.*file/i.test(item.title)) {
			files++;
		} else {
			searches++;
		}
	}
	const parts: string[] = [];
	if (files > 0) parts.push(`${files} file${files !== 1 ? "s" : ""}`);
	if (searches > 0)
		parts.push(`${searches} search${searches !== 1 ? "es" : ""}`);
	return parts.join(", ");
}

export const ExploringGroup = ({
	items,
	isStreaming,
	className,
}: ExploringGroupProps) => {
	const [expanded, setExpanded] = useState(isStreaming);
	const scrollRef = useRef<HTMLDivElement>(null);
	const hasCollapsedRef = useRef(false);

	// Auto-collapse when streaming ends
	useEffect(() => {
		if (!isStreaming && !hasCollapsedRef.current) {
			hasCollapsedRef.current = true;
			setExpanded(false);
		}
	}, [isStreaming]);

	// Auto-scroll to bottom while streaming
	useEffect(() => {
		if (isStreaming && expanded && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [isStreaming, expanded]);

	const summary = buildSummary(items);

	return (
		<div
			className={cn(
				"not-prose mb-4 w-full overflow-hidden rounded-md border",
				className,
			)}
		>
			{/* Header */}
			<button
				className="flex w-full items-center gap-2 px-3 py-2"
				onClick={() => setExpanded((prev) => !prev)}
				type="button"
			>
				<ChevronRightIcon
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						expanded && "rotate-90",
					)}
				/>
				{isStreaming ? (
					<Shimmer as="span" className="text-xs">
						Exploring...
					</Shimmer>
				) : (
					<span className="text-muted-foreground text-xs">Explored</span>
				)}
				{summary && (
					<span className="text-muted-foreground/70 text-xs">{summary}</span>
				)}
			</button>

			{/* Expandable items */}
			{expanded && (
				<div
					className="max-h-[160px] overflow-y-auto border-t px-3 py-1"
					ref={scrollRef}
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
			)}
		</div>
	);
};
