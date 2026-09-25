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
import stripAnsi from "strip-ansi";
import { formatTeardownReason } from "../../../DashboardSidebarDeleteDialog/components/TeardownFailedPane";
import {
	type BulkWorkspaceDeleteFailure,
	bulkWorkspaceDestroyErrorMessage,
} from "../../hooks/useBulkWorkspaceDelete";

interface DashboardSidebarBulkDeleteFailuresProps {
	failures: BulkWorkspaceDeleteFailure[];
	onClose: () => void;
	onForceTeardownFailures: () => void;
}

export function DashboardSidebarBulkDeleteFailures({
	failures,
	onClose,
	onForceTeardownFailures,
}: DashboardSidebarBulkDeleteFailuresProps) {
	const teardownFailureCount = failures.filter(
		(failure) => failure.error.kind === "teardown-failed",
	).length;

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent className="max-w-[500px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Plural
							value={failures.length}
							one="Couldn’t delete # workspace"
							other="Couldn’t delete # workspaces"
						/>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							Review each failure before deciding whether to continue.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="max-h-64 space-y-2 overflow-y-auto px-4 pb-2">
					{failures.map(({ workspace, error }) => {
						const workspaceName = workspace.name || workspace.branch;
						if (error.kind !== "teardown-failed") {
							return (
								<div
									key={workspace.id}
									className="select-text cursor-text rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
								>
									{bulkWorkspaceDestroyErrorMessage(workspace, error)}
								</div>
							);
						}

						const cleanTail = stripAnsi(error.cause.outputTail ?? "");
						return (
							<div
								key={workspace.id}
								className="rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-2"
							>
								<p className="select-text cursor-text text-xs font-medium text-destructive">
									{workspaceName}: {formatTeardownReason(error.cause)}
								</p>
								{cleanTail && (
									<pre className="select-text cursor-text mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded border bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
										{cleanTail}
									</pre>
								)}
							</div>
						);
					})}
				</div>

				{teardownFailureCount > 0 && (
					<p className="px-4 pb-2 text-xs text-muted-foreground">
						<Plural
							value={teardownFailureCount}
							one="Delete anyway skips the teardown script for the affected workspace."
							other="Delete anyway skips the teardown script for the affected workspaces."
						/>
					</p>
				)}

				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onClose}
					>
						<Trans>Close</Trans>
					</Button>
					{teardownFailureCount > 0 && (
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={onForceTeardownFailures}
						>
							<Plural
								value={teardownFailureCount}
								one="Delete anyway"
								other="Delete # anyway"
							/>
						</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
