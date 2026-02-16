import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCloseWorkspace,
	useDeleteWorkspace,
} from "renderer/react-query/workspaces";
import { deleteWithToast } from "renderer/routes/_authenticated/components/TeardownLogsDialog";

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	workspaceType?: "worktree" | "branch";
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	workspaceType = "worktree",
	open,
	onOpenChange,
}: DeleteWorkspaceDialogProps) {
	const isBranch = workspaceType === "branch";
	const deleteWorkspace = useDeleteWorkspace();
	const closeWorkspace = useCloseWorkspace();
	const setDeleteLocalBranchSetting =
		electronTrpc.settings.setDeleteLocalBranch.useMutation();

	const { data: deleteLocalBranchDefault } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery(undefined, {
			enabled: open && !isBranch,
		});
	const [deleteLocalBranch, setDeleteLocalBranch] = useState<boolean | null>(
		null,
	);
	const deleteLocalBranchChecked =
		deleteLocalBranch ?? deleteLocalBranchDefault ?? false;

	const { data: gitStatusData, isLoading: isLoadingGitStatus } =
		electronTrpc.workspaces.canDelete.useQuery(
			{ id: workspaceId },
			{
				enabled: open,
				staleTime: Number.POSITIVE_INFINITY,
			},
		);

	const { data: terminalCountData } =
		electronTrpc.workspaces.canDelete.useQuery(
			{ id: workspaceId, skipGitChecks: true },
			{
				enabled: open,
				refetchInterval: open ? 2000 : false,
			},
		);

	const canDeleteData = gitStatusData
		? {
				...gitStatusData,
				activeTerminalCount:
					terminalCountData?.activeTerminalCount ??
					gitStatusData.activeTerminalCount,
			}
		: terminalCountData;
	const isLoading = isLoadingGitStatus;

	const handleClose = () => {
		onOpenChange(false);

		toast.promise(closeWorkspace.mutateAsync({ id: workspaceId }), {
			loading: "Hiding...",
			success: (result) => {
				if (result.terminalWarning) {
					setTimeout(() => {
						toast.warning("Terminal warning", {
							description: result.terminalWarning,
						});
					}, 100);
				}
				return "Workspace hidden";
			},
			error: (error) =>
				error instanceof Error ? error.message : "Failed to hide",
		});
	};

	const handleDelete = async () => {
		onOpenChange(false);

		setDeleteLocalBranchSetting.mutate({
			enabled: deleteLocalBranchChecked,
		});

		await deleteWithToast({
			name: workspaceName,
			deleteFn: () =>
				deleteWorkspace.mutateAsync({
					id: workspaceId,
					deleteLocalBranch: deleteLocalBranchChecked,
				}),
			forceDeleteFn: () =>
				deleteWorkspace.mutateAsync({
					id: workspaceId,
					deleteLocalBranch: deleteLocalBranchChecked,
					force: true,
				}),
		});
	};

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;
	const hasWarnings = hasChanges || hasUnpushedCommits;

	// For branch workspaces, use simplified dialog (only close option)
	if (isBranch) {
		return (
			<AlertDialog open={open} onOpenChange={onOpenChange}>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Close workspace "{workspaceName}"?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									This will close the workspace and kill any active terminals.
									Your branch and commits will remain in the repository.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleClose}
						>
							Close
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Remove workspace "{workspaceName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							{isLoading ? (
								"Checking status..."
							) : !canDelete ? (
								<span className="text-destructive">{reason}</span>
							) : (
								<span className="block">
									Deleting will permanently remove the worktree. You can hide
									instead to keep files on disk.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && canDelete && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-md px-2.5 py-1.5">
							{hasChanges && hasUnpushedCommits
								? "Has uncommitted changes and unpushed commits"
								: hasChanges
									? "Has uncommitted changes"
									: "Has unpushed commits"}
						</div>
					</div>
				)}

				{!isLoading && canDelete && (
					<div className="px-4 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="delete-local-branch"
								checked={deleteLocalBranchChecked}
								onCheckedChange={(checked) =>
									setDeleteLocalBranch(checked === true)
								}
							/>
							<Label
								htmlFor="delete-local-branch"
								className="text-xs text-muted-foreground cursor-pointer select-none"
							>
								Also delete local branch
							</Label>
						</div>
					</div>
				)}

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleClose}
						disabled={isLoading}
					>
						Hide
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={!canDelete || isLoading}
							>
								Delete
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Permanently delete workspace and git worktree from disk.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
