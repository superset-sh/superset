"use client";

import { cn } from "../../../../../../lib/utils";
import type { FrameRect } from "../../../../utils/commentRuntime";

const STACK_OFFSET = 20;

interface CommentBubbleProps {
	rect: FrameRect;
	stackIndex?: number;
	initials: string;
	count: number;
	resolved: boolean;
	active: boolean;
	onClick: () => void;
}

export function CommentBubble({
	rect,
	stackIndex = 0,
	initials,
	count,
	resolved,
	active,
	onClick,
}: CommentBubbleProps) {
	return (
		<button
			type="button"
			data-comment-ui=""
			onClick={onClick}
			style={{
				transform: `translate(${rect.left - 12 + stackIndex * STACK_OFFSET}px, ${rect.top - 12}px)`,
				zIndex: stackIndex,
			}}
			className={cn(
				"pointer-events-auto absolute top-0 left-0 flex size-6 items-center justify-center rounded-full rounded-bl-sm border font-medium text-[10px] shadow-sm transition-colors",
				resolved
					? "border-border bg-muted text-muted-foreground hover:bg-muted/80"
					: "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90",
				active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
			)}
			aria-label={`${count} comment${count === 1 ? "" : "s"}`}
		>
			{count > 1 ? count : initials}
		</button>
	);
}
