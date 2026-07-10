import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { VscChevronRight } from "react-icons/vsc";
import { useChangesSectionDnd } from "renderer/screens/main/components/WorkspaceView/hooks/useChangesSectionDnd";
import type { ChangeCategory } from "shared/changes-types";

interface CategorySectionProps {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	children: ReactNode;
	actions?: ReactNode;
	onMove?: (fromSection: ChangeCategory, toSection: ChangeCategory) => void;
}

export function CategorySection({
	id,
	title,
	count,
	isExpanded,
	onToggle,
	children,
	actions,
	onMove,
}: CategorySectionProps) {
	const { containerRef, isDragging, isOver } =
		useChangesSectionDnd<HTMLDivElement>({ id, onMove });

	if (count === 0) {
		return null;
	}

	const liveWorkBadgeClass: Partial<Record<ChangeCategory, string>> = {
		unstaged: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		staged: "bg-green-500/15 text-green-700 dark:text-green-400",
	};
	const countBadgeClass = liveWorkBadgeClass[id];
	const isLiveWork = countBadgeClass !== undefined;

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn(
				"min-w-0 overflow-hidden border-t border-border/40 transition-opacity first:border-t-0",
				isDragging && "opacity-45",
			)}
		>
			<div
				ref={containerRef}
				className={cn(
					"group flex items-center min-w-0 cursor-grab active:cursor-grabbing",
					isOver && "bg-accent/20",
				)}
			>
				<CollapsibleTrigger
					className={cn(
						"flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left min-w-0",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					<VscChevronRight
						className={cn(
							"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
					<span
						className={cn(
							"text-xs truncate",
							isLiveWork ? "font-semibold" : "font-medium",
						)}
					>
						{title}
					</span>
					<span
						className={cn(
							"shrink-0 text-[10px] tabular-nums",
							isLiveWork
								? cn(
										"rounded-full px-1.5 py-0.5 font-medium leading-none",
										countBadgeClass,
									)
								: "text-muted-foreground",
						)}
					>
						{count}
					</span>
				</CollapsibleTrigger>
				{actions && <div className="pr-1.5 shrink-0">{actions}</div>}
			</div>

			<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
