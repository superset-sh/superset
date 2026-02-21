import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDeleteWorktree } from "renderer/react-query/workspaces/useDeleteWorktree";
import { deleteWithToast } from "renderer/routes/_authenticated/components/TeardownLogsDialog";

interface DeleteWorktreeDialogProps {
	worktreeId: string;
	worktreeName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorktreeDialog({
	worktreeId,
	worktreeName,
	open,
	onOpenChange,
}: DeleteWorktreeDialogProps) {
	const deleteWorktree = useDeleteWorktree();

	const { data: canDeleteData, isLoading } =
		electronTrpc.workspaces.canDeleteWorktree.useQuery(
			{ worktreeId },
			{
				enabled: open,
			},
		);

	const handleDelete = async () => {
		onOpenChange(false);

		await deleteWithToast({
			name: worktreeName,
			deleteFn: () => deleteWorktree.mutateAsync({ worktreeId }),
			forceDeleteFn: () =>
				deleteWorktree.mutateAsync({ worktreeId, force: true }),
		});
	};

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;
	const hasWarnings = hasChanges || hasUnpushedCommits;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Delete worktree "{worktreeName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							{isLoading ? (
								"Checking status..."
							) : !canDelete ? (
								<span className="text-destructive">{reason}</span>
							) : (
								<span className="block">
									This will permanently delete the worktree and its files from
									disk.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && canDelete && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
							{hasChanges && hasUnpushedCommits
								? "Has uncommitted changes and unpushed commits"
								: hasChanges
									? "Has uncommitted changes"
									: "Has unpushed commits"}
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
							Permanently delete worktree from disk.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
