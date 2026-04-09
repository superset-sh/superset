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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCloseWorkspaces,
	useDeleteWorkspaces,
} from "renderer/react-query/workspaces";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { focusPrimaryDialogAction } from "../DeleteWorkspaceDialog/focus-primary-dialog-action";

interface CanDeleteStatus {
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
	canDelete: boolean;
}

interface BulkDeleteWorkspacesDialogProps {
	workspaceIds: string[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function BulkDeleteWorkspacesDialog({
	workspaceIds,
	open,
	onOpenChange,
}: BulkDeleteWorkspacesDialogProps) {
	const { deleteWorkspaces } = useDeleteWorkspaces();
	const { closeWorkspaces } = useCloseWorkspaces();
	const clearSelection = useWorkspaceSelectionStore((s) => s.clearSelection);
	const utils = electronTrpc.useUtils();

	const setDeleteLocalBranchSetting =
		electronTrpc.settings.setDeleteLocalBranch.useMutation();
	const { data: deleteLocalBranchDefault } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery(undefined, {
			enabled: open,
		});
	const [deleteLocalBranch, setDeleteLocalBranch] = useState<boolean | null>(
		null,
	);
	const deleteLocalBranchChecked =
		deleteLocalBranch ?? deleteLocalBranchDefault ?? false;
	const hideAllButtonRef = useRef<HTMLButtonElement | null>(null);

	// Fetch canDelete status for all workspaces imperatively
	const [canDeleteStatuses, setCanDeleteStatuses] = useState<
		Map<string, CanDeleteStatus>
	>(new Map());
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (!open || workspaceIds.length === 0) {
			setCanDeleteStatuses(new Map());
			return;
		}

		setIsLoading(true);
		let cancelled = false;

		Promise.all(
			workspaceIds.map(async (id) => {
				const result = await utils.workspaces.canDelete.fetch({ id });
				return [id, result] as const;
			}),
		).then((results) => {
			if (cancelled) return;
			const map = new Map<string, CanDeleteStatus>();
			for (const [id, result] of results) {
				map.set(id, {
					hasChanges: result.hasChanges ?? false,
					hasUnpushedCommits: result.hasUnpushedCommits ?? false,
					canDelete: result.canDelete ?? true,
				});
			}
			setCanDeleteStatuses(map);
			setIsLoading(false);
		});

		return () => {
			cancelled = true;
		};
	}, [open, workspaceIds, utils]);

	const withChanges = [...canDeleteStatuses.values()].filter(
		(s) => s.hasChanges,
	).length;
	const withUnpushed = [...canDeleteStatuses.values()].filter(
		(s) => s.hasUnpushedCommits,
	).length;
	const cannotDelete = [...canDeleteStatuses.values()].filter(
		(s) => !s.canDelete,
	).length;
	const hasWarnings = withChanges > 0 || withUnpushed > 0;
	const count = workspaceIds.length;

	const handleClose = useCallback(() => {
		onOpenChange(false);
		clearSelection();
		void closeWorkspaces(workspaceIds);
	}, [onOpenChange, clearSelection, closeWorkspaces, workspaceIds]);

	const handleDelete = useCallback(() => {
		onOpenChange(false);
		clearSelection();
		setDeleteLocalBranchSetting.mutate({ enabled: deleteLocalBranchChecked });
		void deleteWorkspaces(workspaceIds, deleteLocalBranchChecked);
	}, [
		onOpenChange,
		clearSelection,
		setDeleteLocalBranchSetting,
		deleteLocalBranchChecked,
		deleteWorkspaces,
		workspaceIds,
	]);

	// Handle Enter key press to trigger delete action
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey
			) {
				event.preventDefault();
				if (!isLoading && cannotDelete < count) {
					handleDelete();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, isLoading, cannotDelete, count, handleDelete]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				className="max-w-[340px] gap-0 p-0"
				onOpenAutoFocus={(event) => {
					focusPrimaryDialogAction(event, hideAllButtonRef.current);
				}}
			>
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Close {count} workspaces?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							{isLoading ? (
								"Checking status..."
							) : cannotDelete > 0 ? (
								<span className="text-destructive">
									{cannotDelete} of {count} cannot be deleted right now.
								</span>
							) : (
								<span className="block">
									Deleting will permanently remove worktrees from disk. You can
									hide instead to keep files.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-md px-2.5 py-1.5">
							{withChanges > 0 && withUnpushed > 0
								? `${withChanges} of ${count} have uncommitted changes, ${withUnpushed} have unpushed commits`
								: withChanges > 0
									? `${withChanges} of ${count} have uncommitted changes`
									: `${withUnpushed} of ${count} have unpushed commits`}
						</div>
					</div>
				)}

				{!isLoading && cannotDelete < count && (
					<div className="px-4 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="bulk-delete-local-branch"
								checked={deleteLocalBranchChecked}
								onCheckedChange={(checked) =>
									setDeleteLocalBranch(checked === true)
								}
							/>
							<Label
								htmlFor="bulk-delete-local-branch"
								className="text-xs text-muted-foreground cursor-pointer select-none"
							>
								Also delete local branches
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
						ref={hideAllButtonRef}
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleClose}
					>
						Hide All
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={isLoading || cannotDelete >= count}
							>
								Delete All
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Permanently delete {count} workspaces and their git worktrees from
							disk.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
