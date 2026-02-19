import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { buildClaudeCommand } from "../../../../utils/buildClaudeCommand";
import { deriveBranchName } from "../../../../utils/deriveBranchName";

interface OpenInWorkspaceProps {
	task: TaskWithStatus;
}

export function OpenInWorkspace({ task }: OpenInWorkspaceProps) {
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		() => localStorage.getItem("lastOpenedInProjectId"),
	);

	// Default to the first recent project
	const effectiveProjectId = selectedProjectId ?? recentProjects[0]?.id ?? null;
	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	// Sync default once projects load
	useEffect(() => {
		if (!selectedProjectId && recentProjects.length > 0) {
			setSelectedProjectId(recentProjects[0].id);
			localStorage.setItem("lastOpenedInProjectId", recentProjects[0].id);
		}
	}, [selectedProjectId, recentProjects]);

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		await handleSelectProject(effectiveProjectId);
	};

	const handleSelectProject = async (projectId: string) => {
		const branchName = deriveBranchName({
			slug: task.slug,
			title: task.title,
		});

		try {
			const result = await createWorkspace.mutateAsync({
				projectId,
				name: task.slug,
				branchName,
			});

			if (!result.wasExisting) {
				const command = buildClaudeCommand({
					task: {
						id: task.id,
						slug: task.slug,
						title: task.title,
						description: task.description,
						priority: task.priority,
						statusName: task.status.name,
						labels: task.labels,
					},
					randomId: window.crypto.randomUUID(),
				});

				const store = useWorkspaceInitStore.getState();
				const pending = store.pendingTerminalSetups[result.workspace.id];
				store.addPendingTerminalSetup({
					workspaceId: result.workspace.id,
					projectId: result.projectId,
					initialCommands: [...(pending?.initialCommands ?? []), command],
					defaultPresets: pending?.defaultPresets,
				});
			}

			toast.success(
				result.wasExisting ? "Opened existing workspace" : "Workspace created",
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">Open in workspace</span>
			<div className="flex gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="flex-1 justify-between font-normal h-8 min-w-0"
						>
							<span className="flex items-center gap-2 truncate">
								{selectedProject ? (
									<>
										<ProjectThumbnail
											projectId={selectedProject.id}
											projectName={selectedProject.name}
											projectColor={selectedProject.color}
											githubOwner={selectedProject.githubOwner}
											hideImage={selectedProject.hideImage ?? undefined}
											iconUrl={selectedProject.iconUrl}
											className="size-4"
										/>
										<span className="truncate">{selectedProject.name}</span>
									</>
								) : (
									<span className="text-muted-foreground">Select project</span>
								)}
							</span>
							<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-[--radix-dropdown-menu-trigger-width]"
					>
						{recentProjects.length === 0 ? (
							<DropdownMenuItem disabled>No projects found</DropdownMenuItem>
						) : (
							recentProjects
								.filter((p) => p.id)
								.map((project) => (
									<DropdownMenuItem
										key={project.id}
										onClick={() => {
											setSelectedProjectId(project.id);
											localStorage.setItem("lastOpenedInProjectId", project.id);
										}}
										className="flex items-center gap-2"
									>
										<ProjectThumbnail
											projectId={project.id}
											projectName={project.name}
											projectColor={project.color}
											githubOwner={project.githubOwner}
											hideImage={project.hideImage ?? undefined}
											iconUrl={project.iconUrl}
											className="size-4"
										/>
										{project.name}
									</DropdownMenuItem>
								))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					className="h-8 w-8 shrink-0"
					disabled={!effectiveProjectId || createWorkspace.isPending}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	);
}
