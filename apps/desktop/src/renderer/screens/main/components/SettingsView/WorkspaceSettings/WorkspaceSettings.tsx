import { Input } from "@superset/ui/input";
import { HiOutlineFolder, HiOutlinePencilSquare } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useWorkspaceRename } from "renderer/screens/main/components/TopBar/WorkspaceTabs/useWorkspaceRename";

export function WorkspaceSettings() {
	const { data: activeWorkspace, isLoading } =
		trpc.workspaces.getActive.useQuery();

	const rename = useWorkspaceRename(
		activeWorkspace?.id ?? "",
		activeWorkspace?.name ?? "",
	);

	if (isLoading) {
		return (
			<div className="p-6 max-w-4xl select-text">
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

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Workspace</h2>
			</div>

			<div className="space-y-6">
				<div className="space-y-2">
					<h3
						id="workspace-name-label"
						className="text-base font-semibold text-foreground"
					>
						Name
					</h3>
					{rename.isRenaming ? (
						<Input
							ref={rename.inputRef}
							variant="ghost"
							value={rename.renameValue}
							onChange={(e) => rename.setRenameValue(e.target.value)}
							onBlur={rename.submitRename}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									e.currentTarget.blur();
								} else {
									rename.handleKeyDown(e);
								}
							}}
							aria-labelledby="workspace-name-label"
							className="text-base"
						/>
					) : (
						<button
							type="button"
							className="group flex items-center gap-2 cursor-pointer hover:text-foreground/80 transition-colors text-left"
							onClick={rename.startRename}
						>
							<span>{activeWorkspace.name}</span>
							<HiOutlinePencilSquare className="h-4 w-4 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
						</button>
					)}
				</div>

				{activeWorkspace.worktree && (
					<div className="space-y-2">
						<h3 className="font-semibold text-foreground flex items-center gap-2">
							<LuGitBranch className="h-4 w-4" />
							Branch
						</h3>
						<div className="flex items-center gap-3">
							<p>{activeWorkspace.worktree.branch}</p>
							{activeWorkspace.worktree.gitStatus?.needsRebase && (
								<span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
									Needs Rebase
								</span>
							)}
						</div>
					</div>
				)}

				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Path
					</h3>
					<p className="text-sm font-mono break-all">
						{activeWorkspace.worktreePath}
					</p>
				</div>
			</div>
		</div>
	);
}
