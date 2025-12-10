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

interface DiscardConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	filePath: string;
	isUntracked: boolean;
	onConfirm: () => void;
}

export function DiscardConfirmDialog({
	open,
	onOpenChange,
	filePath,
	isUntracked,
	onConfirm,
}: DiscardConfirmDialogProps) {
	const handleConfirm = (e: React.MouseEvent) => {
		e.preventDefault();
		onConfirm();
		onOpenChange(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{isUntracked ? "Delete File" : "Discard Changes"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{isUntracked ? (
							<>
								Are you sure you want to permanently delete "{filePath}"?
								<span className="block mt-2 text-destructive">
									This will permanently delete this file from disk. This action
									cannot be undone.
								</span>
							</>
						) : (
							<>
								Are you sure you want to discard all changes to "{filePath}"?
								<span className="block mt-2 text-destructive">
									This will revert the file to its last committed state. All
									uncommitted changes will be lost. This action cannot be
									undone.
								</span>
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						className="bg-destructive text-white hover:bg-destructive/90"
					>
						{isUntracked ? "Delete" : "Discard"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
