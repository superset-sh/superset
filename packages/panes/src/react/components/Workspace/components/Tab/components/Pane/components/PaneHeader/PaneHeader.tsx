import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface PaneHeaderProps {
	title: ReactNode;
	icon?: ReactNode;
	isActive: boolean;
	titleContent?: ReactNode;
	headerExtras?: ReactNode;
	actionsContent: ReactNode;
	toolbar?: ReactNode;
}

export function PaneHeader({
	title,
	icon,
	isActive,
	titleContent,
	headerExtras,
	actionsContent,
	toolbar,
}: PaneHeaderProps) {
	const chrome = cn(
		"flex h-7 shrink-0 items-center transition-[background-color] duration-150",
		isActive ? "bg-secondary" : "bg-tertiary",
	);

	// Full eject — pane owns the entire toolbar content
	if (toolbar) {
		return <div className={chrome}>{toolbar}</div>;
	}

	// Default layout — matches v1 BasePaneWindow toolbar pattern
	return (
		<div className={chrome}>
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
				<div className="flex shrink-0 items-center gap-0.5">
					{headerExtras}
					{actionsContent}
				</div>
			</div>
		</div>
	);
}
