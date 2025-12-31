import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces";
import { WorkspaceDiffStats } from "./WorkspaceDiffStats";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";

interface WorkspaceListItemProps {
	id: string;
	name: string;
	branch: string;
	type: "worktree" | "branch";
	isActive: boolean;
	shortcutIndex?: number;
}

export function WorkspaceListItem({
	id,
	name,
	branch,
	type,
	isActive,
	shortcutIndex,
}: WorkspaceListItemProps) {
	const setActiveWorkspace = useSetActiveWorkspace();
	const [hasHovered, setHasHovered] = useState(false);

	// Lazy-load GitHub status on hover to avoid N+1 queries
	const { data: githubStatus } = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: id },
		{
			enabled: hasHovered && type === "worktree",
			staleTime: 30_000,
		},
	);

	const handleClick = () => {
		setActiveWorkspace.mutate({ id });
	};

	const handleMouseEnter = () => {
		if (!hasHovered) {
			setHasHovered(true);
		}
	};

	const pr = githubStatus?.pr;
	const showDiffStats = pr && (pr.additions > 0 || pr.deletions > 0);

	return (
		<button
			type="button"
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			className={cn(
				"flex items-center gap-2 w-full px-3 py-1.5 text-sm",
				"hover:bg-muted/50 transition-colors text-left cursor-pointer",
				"group relative",
				isActive && "bg-muted",
			)}
		>
			{/* Active indicator - left border */}
			{isActive && (
				<div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r" />
			)}

			{/* Branch icon for branch type workspaces */}
			{type === "branch" && (
				<LuGitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
			)}

			{/* Workspace name and branch */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className={cn("truncate", isActive && "font-medium")}>
						{name}
					</span>
					{/* PR status badge */}
					{pr && <WorkspaceStatusBadge state={pr.state} prNumber={pr.number} />}
				</div>
				{/* Show branch if different from name */}
				{name !== branch && (
					<div className="text-xs text-muted-foreground truncate font-mono">
						{branch}
					</div>
				)}
			</div>

			{/* Diff stats on right */}
			{showDiffStats && (
				<WorkspaceDiffStats additions={pr.additions} deletions={pr.deletions} />
			)}

			{/* Keyboard shortcut indicator */}
			{shortcutIndex !== undefined && shortcutIndex < 9 && (
				<span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
					{"\u2318"}
					{shortcutIndex + 1}
				</span>
			)}
		</button>
	);
}
