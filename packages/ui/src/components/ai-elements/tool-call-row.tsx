"use client";

import {
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
import { BrailleSpinner } from "./braille-spinner";

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
	 * Overrides the default status slot (X on error, nothing otherwise).
	 * Pass `null` to render nothing. Omit (undefined) to use the default.
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

	const defaultStatus = null;

	const titleContent =
		typeof title === "string" ? (
			<span className="shrink-0 text-xs text-foreground">{title}</span>
		) : (
			title
		);

	return (
		<Collapsible
			className={cn("-mx-1 rounded-md font-mono", className)}
			onOpenChange={(open) => hasDetails && setIsOpen(open)}
			open={hasDetails ? isOpen : false}
		>
			<div className="flex items-center">
				<CollapsibleTrigger asChild>
					<button
						className={cn(
							"flex h-7 min-w-0 flex-1 items-center justify-between rounded-md px-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
							hasDetails
							? "cursor-pointer transition-colors duration-150 hover:bg-muted/30"
							: "cursor-text",
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
							) : isPending ? (
								<span className="flex h-3 w-3 shrink-0 items-center justify-center overflow-hidden">
									<BrailleSpinner />
								</span>
							) : isError ? (
								<XIcon className="h-3 w-3 shrink-0 text-red-500" />
							) : (
								<Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
							)}
							{titleContent}
							{description != null && !isOpen && (
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
					<div className="ml-2.5 border-l border-border">{children}</div>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
