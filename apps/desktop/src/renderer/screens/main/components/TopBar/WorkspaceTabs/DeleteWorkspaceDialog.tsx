import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { toast } from "@superset/ui/sonner";
import { trpc } from "renderer/lib/trpc";
import { useDeleteWorkspace } from "renderer/react-query/workspaces";

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
}: DeleteWorkspaceDialogProps) {
	const deleteWorkspace = useDeleteWorkspace();

	// Initial query for git status (expensive) - only runs once when dialog opens
	const { data: gitStatusData, isLoading: isLoadingGitStatus } =
		trpc.workspaces.canDelete.useQuery(
			{ id: workspaceId },
			{
				enabled: open,
				staleTime: Number.POSITIVE_INFINITY, // Don't refetch automatically
			},
		);

	// Polling query for terminal count only (cheap) - skips git checks
	const { data: terminalCountData } = trpc.workspaces.canDelete.useQuery(
		{ id: workspaceId, skipGitChecks: true },
		{
			enabled: open,
			refetchInterval: open ? 2000 : false,
		},
	);

	// Merge the data: use git status from initial query, terminal count from polling
	const canDeleteData = gitStatusData
		? {
				...gitStatusData,
				activeTerminalCount:
					terminalCountData?.activeTerminalCount ??
					gitStatusData.activeTerminalCount,
			}
		: terminalCountData;
	const isLoading = isLoadingGitStatus;

	const handleDelete = () => {
		onOpenChange(false);

		toast.promise(deleteWorkspace.mutateAsync({ id: workspaceId }), {
			loading: `Deleting "${workspaceName}"...`,
			success: (result) => {
				if (result.teardownError || result.terminalWarning) {
					setTimeout(() => {
						if (result.teardownError) {
							toast.warning("Workspace deleted with teardown warning", {
								description: result.teardownError,
							});
						}
						if (result.terminalWarning) {
							toast.warning("Workspace deleted with terminal warning", {
								description: result.terminalWarning,
							});
						}
					}, 100);
				}
				return `Workspace "${workspaceName}" deleted`;
			},
			error: (error) =>
				error instanceof Error
					? `Failed to delete workspace: ${error.message}`
					: "Failed to delete workspace",
		});
	};

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const warning = canDeleteData?.warning;
	const activeTerminalCount = canDeleteData?.activeTerminalCount ?? 0;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Workspace</AlertDialogTitle>
					<AlertDialogDescription>
						{isLoading ? (
							<span>Checking workspace status...</span>
						) : !canDelete ? (
							<span className="text-destructive">
								Cannot delete workspace: {reason}
							</span>
						) : (
							<>
								Are you sure you want to delete "{workspaceName}"?
								{warning && (
									<span className="block mt-2 text-yellow-600 dark:text-yellow-400">
										Warning: {warning}
									</span>
								)}
								{hasChanges && (
									<span className="block mt-2 text-yellow-600 dark:text-yellow-400">
										This workspace has uncommitted changes that will be lost.
									</span>
								)}
								{hasUnpushedCommits && (
									<span className="block mt-2 text-yellow-600 dark:text-yellow-400">
										This workspace has unpushed commits that will be lost.
									</span>
								)}
								{activeTerminalCount > 0 && (
									<span className="block mt-2 text-muted-foreground">
										{activeTerminalCount} active terminal
										{activeTerminalCount === 1 ? "" : "s"} will be terminated.
									</span>
								)}
								<span className="block mt-2">
									This will remove the workspace and its associated git
									worktree. This action cannot be undone.
								</span>
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e: React.MouseEvent) => {
							e.preventDefault();
							handleDelete();
						}}
						disabled={!canDelete || isLoading}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
