import { Trans } from "@lingui/react/macro";
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
import { useState } from "react";

interface PurgeProjectDialogProps {
	projectName: string | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => Promise<void>;
}

export function PurgeProjectDialog({
	projectName,
	onOpenChange,
	onConfirm,
}: PurgeProjectDialogProps) {
	const [isPurging, setIsPurging] = useState(false);
	return (
		<AlertDialog
			open={projectName !== null}
			onOpenChange={(open) => {
				if (!isPurging) onOpenChange(open);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Permanently delete "{projectName}"?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2">
						<span className="block">
							<Trans>
								Its workspaces and their worktrees are removed from disk now
								instead of after 30 days. The repository folder and worktrees
								with uncommitted changes are kept.
							</Trans>
						</span>
						<span className="block font-medium text-foreground">
							<Trans>This cannot be undone.</Trans>
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPurging}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPurging}
						onClick={async (event) => {
							event.preventDefault();
							setIsPurging(true);
							await onConfirm();
							setIsPurging(false);
							onOpenChange(false);
						}}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isPurging ? (
							<Trans>Deleting…</Trans>
						) : (
							<Trans>Delete permanently</Trans>
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
