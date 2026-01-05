import { cn } from "@superset/ui/utils";

interface ProjectHeaderProps {
	projectName: string;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
}

export function ProjectHeader({
	projectName,
	isCollapsed,
	onToggleCollapse,
	workspaceCount,
}: ProjectHeaderProps) {
	return (
		<button
			type="button"
			onClick={onToggleCollapse}
			aria-expanded={!isCollapsed}
			className={cn(
				"flex items-center gap-2 w-full px-3 py-2 text-sm font-medium",
				"hover:bg-muted/50 transition-colors",
				"text-left cursor-pointer",
			)}
		>
			<span className="truncate flex-1">{projectName}</span>
			<span className="text-xs text-muted-foreground">{workspaceCount}</span>
		</button>
	);
}
