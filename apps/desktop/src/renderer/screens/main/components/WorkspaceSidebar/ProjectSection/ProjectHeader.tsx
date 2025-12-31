import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";

interface ProjectHeaderProps {
	projectName: string;
	projectColor: string;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
}

export function ProjectHeader({
	projectName,
	projectColor,
	isCollapsed,
	onToggleCollapse,
	workspaceCount,
}: ProjectHeaderProps) {
	return (
		<button
			type="button"
			onClick={onToggleCollapse}
			className={cn(
				"flex items-center gap-2 w-full px-3 py-2 text-sm font-medium",
				"hover:bg-muted/50 transition-colors",
				"text-left cursor-pointer",
			)}
		>
			{isCollapsed ? (
				<LuChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
			) : (
				<LuChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
			)}
			<div
				className="w-2 h-2 rounded-full shrink-0"
				style={{ backgroundColor: projectColor }}
			/>
			<span className="truncate flex-1">{projectName}</span>
			<span className="text-xs text-muted-foreground">{workspaceCount}</span>
		</button>
	);
}
