import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { GoArrowUpRight, GoGitBranch } from "react-icons/go";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenExternalWorktree } from "renderer/react-query/workspaces/useOpenExternalWorktree";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";

interface WorktreesGroupProps {
	projectId: string | null;
}

export function WorktreesGroup({ projectId }: WorktreesGroupProps) {
	const navigate = useNavigate();
	const { closeAndResetDraft, runAsyncAction } = useNewWorkspaceModalDraft();

	const { data: externalWorktrees = [], isLoading } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const openExternalWorktree = useOpenExternalWorktree({
		onSuccess: (data) => {
			closeAndResetDraft();
			navigateToWorkspace(data.workspace.id, navigate);
		},
	});

	const existingWorktreeWorkspaceByPath = new Map<string, string>();
	for (const ws of allWorkspaces) {
		if (ws.projectId === projectId && ws.type === "worktree") {
			existingWorktreeWorkspaceByPath.set(ws.branch, ws.id);
		}
	}

	const handleImport = useCallback(
		(worktreePath: string, branch: string) => {
			if (!projectId) return;
			void runAsyncAction(
				openExternalWorktree.mutateAsync({ projectId, worktreePath, branch }),
				{
					loading: "Importing worktree...",
					success: "Worktree imported",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to import worktree",
				},
			);
		},
		[openExternalWorktree, projectId, runAsyncAction],
	);

	const handleOpen = useCallback(
		(workspaceId: string) => {
			closeAndResetDraft();
			navigateToWorkspace(workspaceId, navigate);
		},
		[closeAndResetDraft, navigate],
	);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view worktrees.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (isLoading) {
		return (
			<CommandGroup>
				<CommandEmpty>Loading worktrees...</CommandEmpty>
			</CommandGroup>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No external worktrees found.</CommandEmpty>
			{externalWorktrees.map((wt) => {
				const existingWorkspaceId = existingWorktreeWorkspaceByPath.get(
					wt.branch,
				);
				return (
					<CommandItem
						key={wt.path}
						value={`${wt.branch} ${wt.path}`}
						onSelect={() => {
							if (existingWorkspaceId) {
								handleOpen(existingWorkspaceId);
							} else {
								handleImport(wt.path, wt.branch);
							}
						}}
						className="group h-12"
					>
						{existingWorkspaceId ? (
							<GoArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
						) : (
							<GoGitBranch className="size-4 shrink-0 text-muted-foreground" />
						)}
						<div className="flex flex-col min-w-0 flex-1">
							<span className="truncate">{wt.branch}</span>
							<span className="truncate text-xs text-muted-foreground">
								{wt.path}
							</span>
						</div>
						{existingWorkspaceId ? (
							<Button
								size="xs"
								variant="outline"
								className="shrink-0 hidden group-data-[selected=true]:inline-flex"
								onClick={(e) => {
									e.stopPropagation();
									handleOpen(existingWorkspaceId);
								}}
							>
								Open ↵
							</Button>
						) : (
							<Button
								size="xs"
								className="shrink-0 hidden group-data-[selected=true]:inline-flex"
								onClick={(e) => {
									e.stopPropagation();
									handleImport(wt.path, wt.branch);
								}}
							>
								Import ↵
							</Button>
						)}
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}
