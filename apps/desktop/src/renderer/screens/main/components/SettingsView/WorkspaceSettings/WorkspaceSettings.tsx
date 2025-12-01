import { HiOutlineCodeBracketSquare, HiOutlineFolder } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";

export function WorkspaceSettings() {
	const { data: activeWorkspace, isLoading } =
		trpc.workspaces.getActive.useQuery();

	if (isLoading) {
		return (
			<div className="p-6 max-w-4xl">
				<div className="animate-pulse space-y-4">
					<div className="h-8 bg-muted rounded w-1/3" />
					<div className="h-4 bg-muted rounded w-1/2" />
				</div>
			</div>
		);
	}

	if (!activeWorkspace) {
		return (
			<div className="p-6 max-w-4xl">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Workspace</h2>
					<p className="text-sm text-muted-foreground mt-1">
						No active workspace selected
					</p>
				</div>
			</div>
		);
	}

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Workspace</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Details about the current active workspace
				</p>
			</div>

			<div className="space-y-6">
				{/* Workspace Name */}
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground">
						Workspace Name
					</h3>
					<p className="text-lg font-medium">{activeWorkspace.name}</p>
				</div>

				{/* Project Info */}
				{activeWorkspace.project && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<HiOutlineCodeBracketSquare className="h-4 w-4" />
							Project
						</h3>
						<p className="text-base">{activeWorkspace.project.name}</p>
						<p className="text-sm text-muted-foreground font-mono">
							{activeWorkspace.project.mainRepoPath}
						</p>
					</div>
				)}

				{/* Branch Info */}
				{activeWorkspace.worktree && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<LuGitBranch className="h-4 w-4" />
							Branch
						</h3>
						<div className="flex items-center gap-3">
							<p className="text-base font-mono">
								{activeWorkspace.worktree.branch}
							</p>
							{activeWorkspace.worktree.gitStatus?.needsRebase && (
								<span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
									Needs Rebase
								</span>
							)}
						</div>
					</div>
				)}

				{/* Worktree Path */}
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Worktree Path
					</h3>
					<p className="text-sm font-mono text-muted-foreground break-all">
						{activeWorkspace.worktreePath}
					</p>
				</div>

				{/* Timestamps */}
				<div className="pt-4 border-t space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<h3 className="text-sm font-medium text-muted-foreground">
								Created
							</h3>
							<p className="text-sm">{formatDate(activeWorkspace.createdAt)}</p>
						</div>
						<div className="space-y-1">
							<h3 className="text-sm font-medium text-muted-foreground">
								Last Opened
							</h3>
							<p className="text-sm">
								{formatDate(activeWorkspace.lastOpenedAt)}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
