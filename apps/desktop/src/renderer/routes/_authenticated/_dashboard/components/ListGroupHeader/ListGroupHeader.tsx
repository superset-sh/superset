import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";

interface ListGroupHeaderProps {
	leading: ReactNode;
	label: ReactNode;
	count: number;
	colSpan: number;
	isCollapsed: boolean;
	onToggle: () => void;
	action?: { label: string; onClick: () => void };
}

export function ListGroupHeader({
	leading,
	label,
	count,
	colSpan,
	isCollapsed,
	onToggle,
	action,
}: ListGroupHeaderProps) {
	return (
		<tr>
			<td
				colSpan={colSpan}
				className="group/header sticky top-0 z-10 bg-background p-0"
			>
				<div className="relative flex items-center">
					<button
						type="button"
						onClick={onToggle}
						aria-expanded={!isCollapsed}
						className="group flex w-full items-center px-4 py-2 text-left"
					>
						<HiChevronRight
							className={cn(
								"size-3 text-muted-foreground transition-transform duration-150 group-hover:text-foreground",
								!isCollapsed && "rotate-90",
							)}
						/>
						<span className="flex items-center gap-2 pl-4">
							{leading}
							<span className="text-sm font-medium">{label}</span>
							<span className="text-xs text-muted-foreground tabular-nums">
								{count}
							</span>
						</span>
					</button>
					{action && (
						<button
							type="button"
							onClick={action.onClick}
							aria-label={action.label}
							className="absolute right-3 hidden size-6 items-center justify-center rounded-md text-muted-foreground group-hover/header:flex hover:bg-fill-hover hover:text-foreground focus-visible:flex"
						>
							<LuPlus className="size-3.5" />
						</button>
					)}
				</div>
			</td>
		</tr>
	);
}
