import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiEllipsisHorizontal } from "react-icons/hi2";
import {
	LuExternalLink,
	LuFolderGit2,
	LuGithub,
	LuPlus,
	LuSettings,
} from "react-icons/lu";
import type { AccessibleV2Project } from "renderer/routes/_authenticated/_dashboard/v2-projects/hooks/useAccessibleV2Projects";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface V2ProjectRowProps {
	project: AccessibleV2Project;
}

export function V2ProjectRow({ project }: V2ProjectRowProps) {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	const goToProject = () => {
		navigate({
			to: "/v2-project/$projectId",
			params: { projectId: project.id },
		});
	};

	const goToSettings = () => {
		navigate({
			to: "/settings/project/$projectId",
			params: { projectId: project.id },
		});
	};

	const repoFullName =
		project.githubFullName ??
		(project.githubOwner && project.githubRepoName
			? `${project.githubOwner}/${project.githubRepoName}`
			: null);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="group relative flex items-center border-b border-border/50 text-sm transition-colors hover:bg-background/50">
					<button
						type="button"
						onClick={goToProject}
						aria-label={`Open ${project.name}`}
						className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					/>

					{/* Name column */}
					<div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2">
						<LuFolderGit2
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-medium">{project.name}</span>
							<span className="truncate text-xs text-muted-foreground">
								{project.slug}
							</span>
						</div>
					</div>

					{/* Repository column */}
					<div className="pointer-events-none relative z-10 hidden w-56 items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground md:flex">
						{repoFullName ? (
							<>
								<LuGithub className="size-3.5 shrink-0" />
								<span className="truncate">{repoFullName}</span>
							</>
						) : (
							<span className="italic text-muted-foreground/60">
								No repository
							</span>
						)}
					</div>

					{/* Workspaces column */}
					<div className="pointer-events-none relative z-10 w-28 px-3 py-2 text-xs tabular-nums text-muted-foreground">
						{project.workspaceCount}{" "}
						{project.workspaceCount === 1 ? "workspace" : "workspaces"}
					</div>

					{/* Updated column */}
					<div className="pointer-events-none relative z-10 w-32 px-3 py-2 text-xs text-muted-foreground">
						{getRelativeTime(project.updatedAt.getTime())}
					</div>

					{/* Actions column */}
					<div className="relative z-10 flex w-12 items-center justify-end pr-3">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="Project options"
									className={cn(
										"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
										"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
										"hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									)}
								>
									<HiEllipsisHorizontal className="size-4" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={goToSettings}>
									<LuSettings className="size-4" />
									Project settings
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => openNewWorkspaceModal(project.id)}
								>
									<LuPlus className="size-4" />
									New workspace
								</DropdownMenuItem>
								{repoFullName ? (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem asChild>
											<a
												href={`https://github.com/${repoFullName}`}
												target="_blank"
												rel="noopener noreferrer"
											>
												<LuExternalLink className="size-4" />
												View on GitHub
											</a>
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={goToSettings}>
					<LuSettings className="size-4" />
					Project settings
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => openNewWorkspaceModal(project.id)}>
					<LuPlus className="size-4" />
					New workspace
				</ContextMenuItem>
				{repoFullName ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem asChild>
							<a
								href={`https://github.com/${repoFullName}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								<LuExternalLink className="size-4" />
								View on GitHub
							</a>
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
