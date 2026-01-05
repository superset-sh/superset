import { cn } from "@superset/ui/utils";
import { ProjectThumbnail } from "./ProjectThumbnail";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
}

export function ProjectHeader({
	projectId,
	projectName,
	githubOwner,
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
			<ProjectThumbnail
				projectId={projectId}
				projectName={projectName}
				githubOwner={githubOwner}
			/>
			<span className="truncate flex-1">{projectName}</span>
			<span className="text-xs text-muted-foreground">{workspaceCount}</span>
		</button>
	);
}
