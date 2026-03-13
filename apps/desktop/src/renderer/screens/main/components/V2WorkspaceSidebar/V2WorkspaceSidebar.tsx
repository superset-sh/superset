import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuFolderPlus, LuPlus } from "react-icons/lu";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { useV2SidebarData } from "./hooks/useV2SidebarData";

interface V2WorkspaceSidebarProps {
	isCollapsed?: boolean;
}

export function V2WorkspaceSidebar({
	isCollapsed = false,
}: V2WorkspaceSidebarProps) {
	const { groups, isEmpty } = useV2SidebarData();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
	const [showCreateProject, setShowCreateProject] = useState(false);

	if (isCollapsed) {
		return (
			<div className="h-full border-r border-border bg-muted/45 dark:bg-muted/35" />
		);
	}

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="text-sm font-medium">Workspaces</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-6">
							<LuPlus className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => setShowCreateWorkspace(true)}>
							<LuPlus className="size-4" />
							New Workspace
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setShowCreateProject(true)}>
							<LuFolderPlus className="size-4" />
							New Project
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{isEmpty ? (
					<div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
						<span>No V2 workspaces yet</span>
						<span className="mt-1 text-xs">
							Create a V2 project and workspace to populate this sidebar
						</span>
					</div>
				) : (
					<div className="space-y-4 px-2 py-3">
						{groups.map((project) => (
							<div key={project.id} className="space-y-1">
								<div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
									{project.name}
								</div>
								<div className="space-y-0.5">
									{project.workspaces.map((workspace) => {
										const isActive =
											matchRoute({
												to: "/v2-workspace/$workspaceId",
												params: { workspaceId: workspace.id },
											}) !== false;

										return (
											<button
												key={workspace.id}
												type="button"
												className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
													isActive
														? "bg-accent text-accent-foreground"
														: "hover:bg-muted/50"
												}`}
												onClick={() =>
													navigate({
														to: "/v2-workspace/$workspaceId",
														params: { workspaceId: workspace.id },
													})
												}
											>
												<div className="truncate">{workspace.name}</div>
												<div className="truncate text-xs text-muted-foreground">
													{workspace.branch}
												</div>
											</button>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<CreateWorkspaceDialog
				open={showCreateWorkspace}
				onOpenChange={setShowCreateWorkspace}
				projects={groups}
			/>
			<CreateProjectDialog
				open={showCreateProject}
				onOpenChange={setShowCreateProject}
			/>
		</div>
	);
}
