import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HiChevronRight } from "react-icons/hi2";
import { LuFolderOpen, LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsListPage,
});

function ProjectsListPage() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const navigate = useNavigate();

	const navigateToProject = (projectId: string) => {
		navigate({
			to: "/settings/project/$projectId/general",
			params: { projectId },
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Projects</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Select a project to configure its settings
				</p>
			</div>

			{groups.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No projects yet. Import a repository to get started.
				</p>
			) : (
				<div className="space-y-1">
					{groups.map((group) => {
						const isBranchOnly = group.project.worktreeMode === "disabled";
						const worktreeWorkspaces = group.workspaces.filter(
							(w) => w.type === "worktree",
						);
						const branchWorkspace = group.workspaces.find(
							(w) => w.type === "branch",
						);

						return (
							<div
								key={group.project.id}
								className="rounded-lg border border-border/50 overflow-hidden"
							>
								{/* Project header row */}
								<button
									type="button"
									onClick={() => navigateToProject(group.project.id)}
									className={cn(
										"flex items-center gap-3 w-full px-4 py-3 transition-colors text-left",
										"hover:bg-accent/50 group",
									)}
								>
									<div
										className="w-3 h-3 rounded-full shrink-0"
										style={{ backgroundColor: group.project.color }}
									/>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium truncate">
												{group.project.name}
											</p>
											{isBranchOnly ? (
												<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
													no worktrees
												</span>
											) : (
												worktreeWorkspaces.length > 0 && (
													<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
														{worktreeWorkspaces.length} worktree
														{worktreeWorkspaces.length !== 1 ? "s" : ""}
													</span>
												)
											)}
										</div>
										<p className="text-xs text-muted-foreground truncate">
											{group.project.mainRepoPath}
										</p>
									</div>
									<HiChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
								</button>

								{/* Workspace list (worktree-enabled projects only) */}
								{!isBranchOnly && group.workspaces.length > 0 && (
									<div className="border-t border-border/50 bg-muted/20">
										{branchWorkspace && (
											<div className="flex items-center gap-2 px-4 py-2 pl-10 text-xs text-muted-foreground">
												<LuFolderOpen className="size-3 shrink-0" />
												<span className="font-mono truncate">
													{branchWorkspace.branch}
												</span>
												<span className="text-muted-foreground/50">local</span>
											</div>
										)}
										{worktreeWorkspaces.map((ws) => (
											<div
												key={ws.id}
												className="flex items-center gap-2 px-4 py-2 pl-10 text-xs text-muted-foreground"
											>
												<LuGitBranch className="size-3 shrink-0" />
												<span className="truncate">{ws.name || ws.branch}</span>
												<span className="font-mono text-muted-foreground/50 truncate">
													{ws.branch}
												</span>
											</div>
										))}
									</div>
								)}

								{/* Branch-only: show single branch inline */}
								{isBranchOnly && branchWorkspace && (
									<div className="border-t border-border/50 bg-muted/20">
										<div className="flex items-center gap-2 px-4 py-2 pl-10 text-xs text-muted-foreground">
											<LuFolderOpen className="size-3 shrink-0" />
											<span className="font-mono truncate">
												{branchWorkspace.branch}
											</span>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
