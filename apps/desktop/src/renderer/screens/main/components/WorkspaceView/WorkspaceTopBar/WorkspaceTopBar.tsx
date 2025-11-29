import { HiMiniFolderOpen, HiMiniCodeBracketSquare } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

export function WorkspaceTopBar() {
	const { data } = trpc.workspaces.getActiveWithDetails.useQuery();

	if (!data) {
		return null;
	}

	const { worktree, project } = data;

	const displayPath = worktree?.path ?? "No path";
	const displayBranch = worktree?.branch ?? "No branch";

	return (
		<div className="flex items-center gap-4 px-3 py-2 text-sm text-muted-foreground">
			<div className="flex items-center gap-2 min-w-0">
				<HiMiniFolderOpen className="size-4 shrink-0" />
				<span className="truncate" title={displayPath}>
					{displayPath}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<HiMiniCodeBracketSquare className="size-4 shrink-0" />
				<span title={displayBranch}>{displayBranch}</span>
			</div>
			{project && (
				<div
					className="ml-auto flex items-center gap-2 shrink-0"
					title={`Project: ${project.name}`}
				>
					<div
						className="size-2 rounded-full"
						style={{ backgroundColor: project.color }}
					/>
					<span>{project.name}</span>
				</div>
			)}
		</div>
	);
}
