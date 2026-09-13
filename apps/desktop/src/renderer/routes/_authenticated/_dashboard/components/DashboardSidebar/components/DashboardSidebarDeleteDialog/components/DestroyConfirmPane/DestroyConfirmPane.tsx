import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { useId } from "react";
import { shouldConfirmDeleteDialogKey } from "../../utils/shouldConfirmDeleteDialogKey";

interface DestroyConfirmPaneProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceName: string;
	/** Session workspaces delete a managed folder; no branch to offer. */
	isSession?: boolean;
	/** Local workspaces live on the project's checkout: only the workspace
	 * record goes away, so there is no branch or folder to offer. */
	sharesProjectCheckout?: boolean;
	deleteBranch: boolean;
	onDeleteBranchChange: (next: boolean) => void;
	hasChanges: boolean;
	hasUnpushedCommits: boolean;
	canConfirm: boolean;
	blockingReason: string | null;
	onConfirm: () => void;
	confirmLabel: string;
}

export function DestroyConfirmPane({
	open,
	onOpenChange,
	workspaceName,
	isSession = false,
	sharesProjectCheckout = false,
	deleteBranch,
	onDeleteBranchChange,
	hasChanges,
	hasUnpushedCommits,
	canConfirm,
	blockingReason,
	onConfirm,
	confirmLabel,
}: DestroyConfirmPaneProps) {
	const checkboxId = useId();
	const hasWarnings = hasChanges || hasUnpushedCommits;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						{isSession ? (
							<Trans>Delete session "{workspaceName}"?</Trans>
						) : (
							<Trans>Delete workspace "{workspaceName}"?</Trans>
						)}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{isSession ? (
							<Trans>
								This deletes the session's folder and everything in it from
								disk.
							</Trans>
						) : sharesProjectCheckout ? (
							<Trans>
								This closes the workspace and its terminals. The project's
								files, branches and other workspaces stay as they are.
							</Trans>
						) : (
							<Trans>
								This removes the worktree from disk and closes the workspace.
							</Trans>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="px-4 pb-2">
					<div
						className={
							hasWarnings
								? "text-xs rounded-md border px-2.5 py-1.5 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20"
								: "text-xs rounded-md border border-transparent px-2.5 py-1.5"
						}
						aria-hidden={hasWarnings ? undefined : true}
					>
						{hasWarnings ? (
							hasChanges && hasUnpushedCommits ? (
								<Trans>Has uncommitted changes and unpushed commits</Trans>
							) : hasChanges ? (
								<Trans>Has uncommitted changes</Trans>
							) : (
								<Trans>Has unpushed commits</Trans>
							)
						) : (
							" "
						)}
					</div>
				</div>
				{blockingReason && (
					<div className="px-4 pb-2">
						<div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2.5 py-1.5">
							{blockingReason}
						</div>
					</div>
				)}
				{!isSession && !sharesProjectCheckout && (
					<div className="px-4 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id={checkboxId}
								checked={deleteBranch}
								onCheckedChange={(checked) =>
									onDeleteBranchChange(checked === true)
								}
							/>
							<Label
								htmlFor={checkboxId}
								className="text-xs text-muted-foreground cursor-pointer select-none"
							>
								<Trans>Also delete local branch</Trans>
							</Label>
						</div>
					</div>
				)}
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<AlertDialogCancel className="h-7 border-0 bg-transparent px-3 text-xs shadow-none">
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						onKeyDown={(event) => {
							// Let the button handle Enter natively, except held keys and IME.
							if (
								event.key === "Enter" &&
								!shouldConfirmDeleteDialogKey(event.nativeEvent)
							) {
								event.preventDefault();
							}
						}}
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
						disabled={!canConfirm}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
