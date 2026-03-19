import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LuFolderOpen, LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectSettings } from "../project/$projectId/components/ProjectSettings";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsPage,
});

function ProjectsPage() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		groups[0]?.project.id ?? null,
	);

	// Auto-select first project if none selected
	const effectiveSelectedId =
		selectedProjectId && groups.some((g) => g.project.id === selectedProjectId)
			? selectedProjectId
			: (groups[0]?.project.id ?? null);

	return (
		<div className="flex h-full">
			{/* Left: Project/workspace list */}
			<div className="w-64 shrink-0 border-r border-border overflow-y-auto">
				<div className="p-3">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
						Projects
					</h3>
				</div>
				<div className="px-2 pb-2 space-y-0.5">
					{groups.map((group) => {
						const isBranchOnly = group.project.worktreeMode === "disabled";
						const isSelected = group.project.id === effectiveSelectedId;
						const worktreeWorkspaces = group.workspaces.filter(
							(w) => w.type === "worktree",
						);
						const branchWorkspace = group.workspaces.find(
							(w) => w.type === "branch",
						);

						return (
							<div key={group.project.id}>
								{/* Project row */}
								<button
									type="button"
									onClick={() => setSelectedProjectId(group.project.id)}
									className={cn(
										"flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors text-sm",
										isSelected
											? "bg-accent text-accent-foreground"
											: "hover:bg-accent/50",
									)}
								>
									<div
										className="w-2.5 h-2.5 rounded-full shrink-0"
										style={{
											backgroundColor: group.project.color,
										}}
									/>
									<span className="truncate font-medium">
										{group.project.name}
									</span>
									{isBranchOnly ? (
										<span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground ml-auto shrink-0">
											local
										</span>
									) : (
										worktreeWorkspaces.length > 0 && (
											<span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground ml-auto shrink-0">
												{worktreeWorkspaces.length}
											</span>
										)
									)}
								</button>

								{/* Workspace sub-items (worktree-enabled projects only) */}
								{!isBranchOnly && group.workspaces.length > 0 && (
									<div className="ml-7 mt-0.5 space-y-0.5 border-l border-border/40 pl-2">
										{branchWorkspace && (
											<div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
												<LuFolderOpen className="size-3 shrink-0" />
												<span className="font-mono truncate">
													{branchWorkspace.branch}
												</span>
											</div>
										)}
										{worktreeWorkspaces.map((ws) => (
											<div
												key={ws.id}
												className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"
											>
												<LuGitBranch className="size-3 shrink-0" />
												<span className="truncate">{ws.name || ws.branch}</span>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}

					{groups.length === 0 && (
						<p className="text-xs text-muted-foreground px-2 py-4">
							No projects yet.
						</p>
					)}
				</div>
			</div>

			{/* Right: Selected project settings */}
			<div className="flex-1 overflow-y-auto">
				{effectiveSelectedId ? (
					<ProjectSettings projectId={effectiveSelectedId} />
				) : (
					<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
						Select a project to view its settings
					</div>
				)}
			</div>
		</div>
	);
}
