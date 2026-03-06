import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useChangesSectionDnd } from "renderer/screens/main/components/WorkspaceView/hooks/useChangesSectionDnd";
import type { ChangeCategory } from "shared/changes-types";

interface CategoryHeaderProps {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	onMove?: (fromSection: ChangeCategory, toSection: ChangeCategory) => void;
}

export function CategoryHeader({
	id,
	title,
	count,
	isExpanded,
	onToggle,
	onMove,
}: CategoryHeaderProps) {
	const { containerRef, isDragging, isOver } =
		useChangesSectionDnd<HTMLButtonElement>({ id, onMove });

	if (count === 0) return null;

	return (
		<button
			ref={containerRef}
			type="button"
			onClick={onToggle}
			className={cn(
				"flex items-center gap-2 px-4 py-2 w-full text-left transition-colors sticky top-0 z-20 border-b border-r border-border",
				"hover:bg-muted cursor-grab active:cursor-grabbing",
				isOver && "bg-muted",
				isDragging && "opacity-45",
			)}
		>
			{isExpanded ? (
				<LuChevronDown className="size-4 text-muted-foreground" />
			) : (
				<LuChevronRight className="size-4 text-muted-foreground" />
			)}
			<span className="text-sm font-semibold">{title}</span>
			<span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
				{count}
			</span>
		</button>
	);
}
