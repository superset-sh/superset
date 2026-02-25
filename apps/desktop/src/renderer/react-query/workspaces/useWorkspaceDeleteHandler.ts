import { useEffect, useRef, useState } from "react";
import {
	clearPendingDeleteDialogOpen,
	scheduleDeleteDialogOpen,
} from "./deleteDialogOpenScheduler";

interface UseWorkspaceDeleteHandlerResult {
	/** Whether the delete dialog should be shown */
	showDeleteDialog: boolean;
	/** Set whether the delete dialog should be shown */
	setShowDeleteDialog: (show: boolean) => void;
	/** Handle delete click - always shows the dialog to let user choose close or delete */
	handleDeleteClick: (e?: React.MouseEvent) => void;
}

/**
 * Shared hook for workspace delete/close dialog state.
 * Always shows the confirmation dialog to let user choose between closing or deleting.
 */
export function useWorkspaceDeleteHandler(): UseWorkspaceDeleteHandlerResult {
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const pendingOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	useEffect(() => {
		return () => {
			clearPendingDeleteDialogOpen(pendingOpenTimerRef);
		};
	}, []);

	const handleDeleteClick = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		scheduleDeleteDialogOpen({
			pendingTimerRef: pendingOpenTimerRef,
			setShowDeleteDialog,
		});
	};

	return {
		showDeleteDialog,
		setShowDeleteDialog,
		handleDeleteClick,
	};
}
