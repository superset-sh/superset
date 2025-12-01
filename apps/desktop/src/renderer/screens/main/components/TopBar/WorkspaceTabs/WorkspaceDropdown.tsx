import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMiniFolderOpen, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

export interface WorkspaceDropdownProps {
	className?: string;
}

export function WorkspaceDropdown({ className }: WorkspaceDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);

	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const openNew = useOpenNew();

	const handleCreateWorkspace = (projectId: string) => {
		toast.promise(createWorkspace.mutateAsync({ projectId }), {
			loading: "Creating workspace...",
			success: () => {
				setIsOpen(false);
				return "Workspace created";
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to create workspace",
		});
	};

	const handleOpenNewProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (!result.canceled && result.project) {
				handleCreateWorkspace(result.project.id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger className={className} asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Add new workspace"
					className="ml-1 size-7 text-muted-foreground hover:text-foreground"
				>
					<HiMiniPlus className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-80 p-0" align="start">
				<div className="py-2">
					{recentProjects.length > 0 && (
						<div className="px-2 pb-2 border-b">
							<p className="text-xs text-muted-foreground px-2 py-1.5">
								Recent Projects
							</p>
							{recentProjects.map((project) => (
								<button
									type="button"
									key={project.id}
									onClick={() => handleCreateWorkspace(project.id)}
									disabled={createWorkspace.isPending}
									className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
								>
									<div className="font-medium">{project.name}</div>
									<div className="text-xs text-muted-foreground truncate">
										{project.mainRepoPath}
									</div>
								</button>
							))}
						</div>
					)}
					<div className="px-2 pt-2">
						<button
							type="button"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending || createWorkspace.isPending}
							className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
						>
							<HiMiniFolderOpen className="h-4 w-4" />
							<span>Open New Project...</span>
						</button>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
