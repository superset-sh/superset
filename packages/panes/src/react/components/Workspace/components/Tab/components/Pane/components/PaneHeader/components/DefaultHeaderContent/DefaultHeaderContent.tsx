import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface DefaultHeaderContentProps {
	title: ReactNode;
	icon?: ReactNode;
	isActive: boolean;
	titleContent?: ReactNode;
	headerExtras?: ReactNode;
	actionsContent: ReactNode;
}

export function DefaultHeaderContent({
	title,
	icon,
	isActive,
	titleContent,
	headerExtras,
	actionsContent,
}: DefaultHeaderContentProps) {
	return (
		<div className="flex h-full w-full min-w-0 items-center gap-2 px-3">
			{/* font-semibold on the wrapper so custom titleContent inherits the
			    active bolding too, not just the default title span. */}
			{/* overflow-hidden: with flex-1's zero basis this area is the first
			    to be squeezed, and a custom titleContent (e.g. the terminal
			    session dropdown) has its own min-content width — without the
			    clip it would keep painting past this box over the action icons. */}
			<div
				className={cn(
					"flex min-w-0 flex-1 items-center gap-2 overflow-hidden",
					isActive && "font-semibold",
				)}
			>
				{titleContent ?? (
					<>
						{icon && <span className="shrink-0">{icon}</span>}
						<span
							className={cn(
								"truncate text-xs transition-colors duration-150",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
							title={typeof title === "string" ? title : undefined}
						>
							{title}
						</span>
					</>
				)}
			</div>
			{/* The title above shrinks to nothing first (flex-1 min-w-0). If the
			    extras alone are still wider than the header, this wrapper clips
			    from its left edge (justify-end + overflow-hidden) instead of
			    spilling past the pane or piling buttons on top of each other —
			    the split/close actions on the right are the last thing to go.
			    Holds for any icon size; components lower their own priority via
			    the @container/pane-header queries. */}
			<div className="flex min-w-0 items-center justify-end gap-0.5 overflow-hidden">
				{headerExtras}
				{actionsContent}
			</div>
		</div>
	);
}
