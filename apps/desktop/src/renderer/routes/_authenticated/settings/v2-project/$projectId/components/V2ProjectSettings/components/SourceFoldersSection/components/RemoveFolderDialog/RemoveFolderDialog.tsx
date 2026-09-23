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
import type { ProjectFolder } from "../../types";

interface RemoveFolderDialogProps {
	folder: ProjectFolder | null;
	isSubmitting: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function RemoveFolderDialog({
	folder,
	isSubmitting,
	onOpenChange,
	onConfirm,
}: RemoveFolderDialogProps) {
	return (
		<AlertDialog open={folder !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Remove {folder?.folder} from this project?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							New workspaces will stop checking this repository out. Existing
							workspaces keep it, and nothing is deleted from disk.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isSubmitting}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
						disabled={isSubmitting}
					>
						<Trans>Remove folder</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
