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
			<div
				className={cn(
					"flex min-w-0 flex-1 items-center gap-2",
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
			{/* The header is a native drag source: canceling dragstart here keeps a
			    press that moves a few pixels on these controls a click instead of a
			    pane drag, and stopped clicks keep them from also firing the
			    header's click-to-pin. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: propagation shield around header controls, not an interactive control */}
			<div
				className="flex shrink-0 items-center gap-0.5"
				draggable
				onDragStart={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				{headerExtras}
				{actionsContent}
			</div>
		</div>
	);
}
