import { cn } from "@superset/ui/utils";
import { type ReactNode, useRef } from "react";
import { useScrollOverflowState } from "./hooks/useScrollOverflowState";
import { useStickyBottomScroll } from "./hooks/useStickyBottomScroll";

const MAX_HEIGHT_CLASS = {
	summary: "max-h-[240px]",
	base: "max-h-[288px]",
} as const;

export type DetailScrollSize = keyof typeof MAX_HEIGHT_CLASS;

/**
 * The scroll box every tool body sits in: capped in height, following the
 * bottom while its content streams, fading at whichever edge hides more.
 */
export function DetailScroll({
	children,
	className,
	contentKey,
	scrollClassName,
	size = "base",
	streaming = false,
}: {
	children: ReactNode;
	/** Anything that changes with the content, so a new chunk re-pins the bottom. */
	contentKey: string;
	size?: DetailScrollSize;
	streaming?: boolean;
	className?: string;
	scrollClassName?: string;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const sticky = useStickyBottomScroll({ contentKey, scrollRef, streaming });
	const overflow = useScrollOverflowState(scrollRef);
	return (
		<div className={cn("relative isolate min-w-0", className)}>
			<div
				className={cn(
					"min-w-0 overflow-y-auto overflow-x-hidden outline-none",
					MAX_HEIGHT_CLASS[size],
					scrollClassName,
				)}
				onPointerDown={sticky.onPointerDown}
				onScroll={sticky.onScroll}
				onTouchMove={sticky.onTouchMove}
				onTouchStart={sticky.onTouchStart}
				onWheel={sticky.onWheel}
				ref={scrollRef}
				tabIndex={-1}
			>
				<div ref={sticky.contentRef}>{children}</div>
			</div>
			{/* Over the scrolling body, under a card's sticky header. */}
			{overflow.above && (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-6 bg-gradient-to-b from-background to-transparent"
				/>
			)}
			{overflow.below && (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-6 bg-gradient-to-t from-background to-transparent"
				/>
			)}
		</div>
	);
}
