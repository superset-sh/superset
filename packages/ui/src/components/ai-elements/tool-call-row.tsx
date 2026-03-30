"use client";

import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	XIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import { Loader } from "./loader";
import { ShimmerLabel } from "./shimmer-label";

export type ToolCallRowProps = {
	/** Icon shown in the header (replaced by chevron on hover when expandable). */
	icon: ComponentType<{ className?: string }>;
	/**
	 * Header title. A plain string is wrapped in a ShimmerLabel that pulses while
	 * `isPending` is true. Any other ReactNode is rendered as-is (useful when the
	 * title contains interactive elements like clickable file paths).
	 */
	title: ReactNode;
	/** Optional muted text rendered after the title, truncated when too long. */
	description?: ReactNode;
	/** When true the title shimmers and the default status shows a spinner. */
	isPending?: boolean;
	/** When true the default status shows an X icon. */
	isError?: boolean;
	/**
	 * Overrides the default status icon slot (spinner / check / X).
	 * Pass `null` to render nothing in the status slot.
	 * Omit (undefined) to use the default behaviour.
	 */
	statusNode?: ReactNode;
	/**
	 * Extra element placed outside (after) the CollapsibleTrigger button — useful
	 * for action buttons that must not toggle expansion when clicked (e.g. "Open
	 * in pane").
	 */
	headerExtra?: ReactNode;
	/** Expandable content rendered inside the collapsible area with the left border. */
	children?: ReactNode;
	className?: string;
};

/**
 * Shared collapsible row used by every tool call type.
 *
 * Provides a consistent layout:
 *   [icon/chevron]  [title]  [description ...]  |  [status]  [headerExtra?]
 *   └── collapsible content with left border ─────────────────────────────┘
 */
export function ToolCallRow({
	icon: Icon,
	title,
	description,
	isPending = false,
	isError = false,
	statusNode,
	headerExtra,
	children,
	className,
}: ToolCallRowProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const hasDetails = children != null && children !== false;

	const defaultStatus = (
		<div className="flex h-6 w-6 items-center justify-center">
			{isPending ? (
				<Loader size={12} />
			) : isError ? (
				<XIcon className="h-3 w-3" />
			) : (
				<CheckIcon className="h-3 w-3" />
			)}
		</div>
	);

	const titleContent =
		typeof title === "string" ? (
			<ShimmerLabel
				className="shrink-0 text-xs text-foreground"
				isShimmering={isPending}
			>
				{title}
			</ShimmerLabel>
		) : (
			title
		);

	return (
		<Collapsible
			className={cn("overflow-hidden rounded-md font-mono", className)}
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<div className="flex items-center">
				<CollapsibleTrigger asChild>
					<button
						className={cn(
							"flex h-7 min-w-0 flex-1 items-center justify-between rounded-b-md px-1 text-left",
							hasDetails && "transition-colors duration-150 hover:bg-muted/30",
						)}
						data-tool-trigger
						disabled={!hasDetails}
						onMouseEnter={() => setIsHovered(true)}
						onMouseLeave={() => setIsHovered(false)}
						type="button"
					>
						<div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
							{isHovered && hasDetails ? (
								isOpen ? (
									<ChevronDownIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
								) : (
									<ChevronRightIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
								)
							) : (
								<Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
							)}
							{titleContent}
							{description != null && (
								<span className="min-w-0 truncate text-xs text-muted-foreground">
									{description}
								</span>
							)}
						</div>
						<div className="ml-2 flex shrink-0 items-center text-muted-foreground">
							{statusNode !== undefined ? statusNode : defaultStatus}
						</div>
					</button>
				</CollapsibleTrigger>
				{headerExtra}
			</div>
			{hasDetails && (
				<CollapsibleContent className="outline-none">
					<div className="ml-2.5 mt-0.5 border-l border-border">{children}</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
