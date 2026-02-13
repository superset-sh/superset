import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuFolderGit, LuFolderOpen, LuFolderPlus } from "react-icons/lu";
import {
	processOpenNewResults,
	useOpenNew,
} from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { CloneRepoDialog } from "../StartView/CloneRepoDialog";
import { STROKE_WIDTH } from "./constants";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
	const openNew = useOpenNew();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);

	const handleOpenProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) {
				return;
			}
			if ("error" in result) {
				toast.error("Failed to open project", {
					description: result.error,
				});
				return;
			}

			if ("results" in result) {
				const { successes } = processOpenNewResults({
					results: result.results,
					showGitInitToast: true,
				});

				for (const s of successes) {
					try {
						await createBranchWorkspace.mutateAsync({
							projectId: s.project.id,
						});
					} catch (err) {
						toast.error(`Failed to open ${s.project.name}`, {
							description:
								err instanceof Error
									? err.message
									: "Failed to create workspace",
						});
					}
				}
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleCloneError = (error: string) => {
		toast.error("Failed to clone repository", {
			description: error,
		});
	};

	const isLoading = openNew.isPending || createBranchWorkspace.isPending;

	if (isCollapsed) {
		return (
			<>
				<div className="border-t border-border p-2 flex justify-center">
					<DropdownMenu>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 text-muted-foreground hover:text-foreground"
										disabled={isLoading}
									>
										<LuFolderPlus
											className="size-4"
											strokeWidth={STROKE_WIDTH}
										/>
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="right">Add repository</TooltipContent>
						</Tooltip>
						<DropdownMenuContent side="top" align="start">
							<DropdownMenuItem
								onClick={handleOpenProject}
								disabled={isLoading}
							>
								<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
								Open project
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIsCloneDialogOpen(true)}
								disabled={isLoading}
							>
								<LuFolderGit className="size-4" strokeWidth={STROKE_WIDTH} />
								Clone repo
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<CloneRepoDialog
					isOpen={isCloneDialogOpen}
					onClose={() => setIsCloneDialogOpen(false)}
					onError={handleCloneError}
				/>
			</>
		);
	}

	return (
		<>
			<div className="border-t border-border p-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
							disabled={isLoading}
						>
							<LuFolderPlus className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
							<span>Add repository</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="start">
						<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
							<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
							Open project
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setIsCloneDialogOpen(true)}
							disabled={isLoading}
						>
							<LuFolderGit className="size-4" strokeWidth={STROKE_WIDTH} />
							Clone repo
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CloneRepoDialog
				isOpen={isCloneDialogOpen}
				onClose={() => setIsCloneDialogOpen(false)}
				onError={handleCloneError}
			/>
		</>
	);
}
