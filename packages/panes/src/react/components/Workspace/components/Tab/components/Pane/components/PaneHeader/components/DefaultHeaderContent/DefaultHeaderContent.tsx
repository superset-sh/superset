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
		<div className="flex h-full w-full items-center justify-between px-3">
			<div className="flex min-w-0 items-center gap-2">
				{titleContent ?? (
					<>
						{icon && <span className="shrink-0">{icon}</span>}
						<span
							className={cn(
								"truncate text-sm transition-colors duration-150",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{title}
						</span>
					</>
				)}
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag from starting on action buttons */}
			<div
				className="flex shrink-0 items-center gap-0.5"
				onMouseDown={(e) => e.stopPropagation()}
			>
				{headerExtras}
				{actionsContent}
			</div>
		</div>
	);
}
