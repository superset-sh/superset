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
import { useTabsStore } from "renderer/stores/tabs/store";

export function ActiveAgentWarningDialog() {
	const pendingCloseTabId = useTabsStore((s) => s.pendingCloseTabId);
	const pendingClosePaneId = useTabsStore((s) => s.pendingClosePaneId);
	const confirmRemoveTab = useTabsStore((s) => s.confirmRemoveTab);
	const cancelRemoveTab = useTabsStore((s) => s.cancelRemoveTab);
	const confirmRemovePane = useTabsStore((s) => s.confirmRemovePane);
	const cancelRemovePane = useTabsStore((s) => s.cancelRemovePane);

	const isOpen = pendingCloseTabId !== null || pendingClosePaneId !== null;

	const handleCancel = () => {
		if (pendingCloseTabId) cancelRemoveTab();
		if (pendingClosePaneId) cancelRemovePane();
	};

	const handleConfirm = () => {
		if (pendingCloseTabId) confirmRemoveTab();
		if (pendingClosePaneId) confirmRemovePane();
	};

	return (
		<AlertDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) handleCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Running process detected</AlertDialogTitle>
					<AlertDialogDescription>
						A process is still running. Closing will terminate it.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						Close
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
