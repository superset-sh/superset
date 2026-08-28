import { Plural, Trans } from "@lingui/react/macro";
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
import { useId } from "react";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarBulkDeleteFailures } from "./components/DashboardSidebarBulkDeleteFailures";
import { useBulkWorkspaceDelete } from "./hooks/useBulkWorkspaceDelete";

interface DashboardSidebarBulkDeleteDialogProps {
	workspaces: DashboardSidebarWorkspace[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted: (workspaceIds: string[]) => void;
}

export function DashboardSidebarBulkDeleteDialog({
	workspaces,
	open,
	onOpenChange,
	onDeleted,
}: DashboardSidebarBulkDeleteDialogProps) {
	const checkboxId = useId();
	const {
		completedCount,
		deleteBranch,
		failures,
		forceTeardownFailures,
		inspectionSummary,
		isDeleting,
		run,
		setDeleteBranch,
	} = useBulkWorkspaceDelete({
		workspaces,
		open,
		onOpenChange,
		onDeleted,
	});
	const { canConfirm, changedCount, items, uncheckedCount, unpushedCount } =
		inspectionSummary;
	const hasWarnings = changedCount > 0 || unpushedCount > 0;

	if (failures.length > 0) {
		return (
			<DashboardSidebarBulkDeleteFailures
				failures={failures}
				isDeleting={isDeleting}
				onClose={() => onOpenChange(false)}
				onForceTeardownFailures={forceTeardownFailures}
			/>
		);
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (isDeleting) return;
				onOpenChange(next);
			}}
		>
			<AlertDialogContent className="max-w-[440px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Plural
							id="dashboard.sidebar.bulkDelete.title"
							value={workspaces.length}
							one="Delete # workspace?"
							other="Delete # workspaces?"
						/>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans id="dashboard.sidebar.bulkDelete.description">
							This removes every selected worktree from disk and deletes its
							workspace record.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="px-4 pb-2">
					<ul className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-muted/60 px-2.5 py-2 text-xs">
						{items.map((item) => (
							<li
								key={item.workspaceId}
								className="flex min-w-0 items-start justify-between gap-3"
							>
								<span className="min-w-0 truncate">{item.workspaceName}</span>
								{item.status === "loading" && (
									<span className="shrink-0 text-muted-foreground">
										<Trans id="dashboard.sidebar.bulkDelete.checking">
											Checking…
										</Trans>
									</span>
								)}
								{item.status === "error" && (
									<span className="select-text cursor-text shrink-0 text-destructive">
										<Trans id="dashboard.sidebar.bulkDelete.couldntVerify">
											Couldn’t verify
										</Trans>
									</span>
								)}
								{item.status === "blocked" && (
									<span className="select-text cursor-text max-w-52 text-right text-destructive">
										{item.reason}
									</span>
								)}
								{item.status === "ready" &&
									(item.hasChanges || item.hasUnpushedCommits) && (
										<span className="shrink-0 text-right text-yellow-700 dark:text-yellow-400">
											{item.hasChanges && item.hasUnpushedCommits ? (
												<Trans id="dashboard.sidebar.bulkDelete.uncommittedAndUnpushed">
													Uncommitted · Unpushed
												</Trans>
											) : item.hasChanges ? (
												<Trans id="dashboard.sidebar.bulkDelete.uncommitted">
													Uncommitted
												</Trans>
											) : (
												<Trans id="dashboard.sidebar.bulkDelete.unpushed">
													Unpushed
												</Trans>
											)}
										</span>
									)}
							</li>
						))}
					</ul>
				</div>

				<div className="px-4 pb-2">
					<div className="flex items-center gap-2">
						<Checkbox
							id={checkboxId}
							checked={deleteBranch}
							disabled={isDeleting}
							onCheckedChange={(checked) => setDeleteBranch(checked === true)}
						/>
						<Label
							htmlFor={checkboxId}
							className="cursor-pointer select-none text-xs text-muted-foreground"
						>
							<Trans id="dashboard.sidebar.bulkDelete.alsoDeleteBranches">
								Also delete local branches
							</Trans>
						</Label>
					</div>
				</div>

				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={isDeleting}
						onClick={() => onOpenChange(false)}
					>
						<Trans id="dashboard.sidebar.bulkDelete.cancel">Cancel</Trans>
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						disabled={!canConfirm || isDeleting}
						onClick={run}
					>
						{isDeleting ? (
							<Trans id="dashboard.sidebar.bulkDelete.deletingProgress">
								Deleting {Math.min(completedCount + 1, workspaces.length)} of{" "}
								{workspaces.length}…
							</Trans>
						) : uncheckedCount > 0 ? (
							<Trans id="dashboard.sidebar.bulkDelete.deleteWithoutChecking">
								Delete without checking
							</Trans>
						) : hasWarnings ? (
							<Trans id="dashboard.sidebar.bulkDelete.deleteAnyway">
								Delete anyway
							</Trans>
						) : (
							<Trans id="dashboard.sidebar.bulkDelete.delete">Delete</Trans>
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
