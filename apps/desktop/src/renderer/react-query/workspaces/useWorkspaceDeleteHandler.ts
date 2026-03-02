import { useEffect, useRef, useState } from "react";

export interface PendingDeleteDialogTimerRef {
	current: ReturnType<typeof setTimeout> | null;
}

export interface AutoFocusEventLike {
	preventDefault: () => void;
}

/**
 * Defers opening the delete dialog to the next macrotask.
 * This avoids a focus race with Radix ContextMenu focus restoration.
 */
export function deferDeleteDialogOpen(
	setShowDeleteDialog: (show: boolean) => void,
) {
	return setTimeout(() => {
		setShowDeleteDialog(true);
	}, 0);
}

export function clearPendingDeleteDialogOpen(
	pendingTimerRef: PendingDeleteDialogTimerRef,
	clearTimer: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
	if (pendingTimerRef.current === null) return;
	clearTimer(pendingTimerRef.current);
	pendingTimerRef.current = null;
}

export function scheduleDeleteDialogOpen({
	pendingTimerRef,
	setShowDeleteDialog,
	deferOpen = deferDeleteDialogOpen,
	clearTimer = clearTimeout,
}: {
	pendingTimerRef: PendingDeleteDialogTimerRef;
	setShowDeleteDialog: (show: boolean) => void;
	deferOpen?: (
		setShowDeleteDialog: (show: boolean) => void,
	) => ReturnType<typeof setTimeout>;
	clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
	clearPendingDeleteDialogOpen(pendingTimerRef, clearTimer);
	const wrappedSet: typeof setShowDeleteDialog = (show) => {
		pendingTimerRef.current = null;
		setShowDeleteDialog(show);
	};
	pendingTimerRef.current = deferOpen(wrappedSet);
}

/**
 * Coordinates opening the delete dialog from a ContextMenu item selection.
 *
 * When "Close Worktree" is selected, we wait for ContextMenu close and then:
 * 1) prevent Radix auto-focus from returning to the trigger
 * 2) open the delete dialog
 */
export function createContextMenuDeleteDialogCoordinator(
	openDeleteDialog: () => void,
) {
	let shouldOpenDeleteDialog = false;

	return {
		requestOpenDeleteDialog() {
			shouldOpenDeleteDialog = true;
		},
		handleCloseAutoFocus(event: AutoFocusEventLike) {
			if (!shouldOpenDeleteDialog) return;
			shouldOpenDeleteDialog = false;
			event.preventDefault();
			openDeleteDialog();
		},
	};
}

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
	const pendingOpenTimerRef = useRef<PendingDeleteDialogTimerRef>({
		current: null,
	});

	useEffect(() => {
		return () => {
			clearPendingDeleteDialogOpen(pendingOpenTimerRef.current);
		};
	}, []);

	const handleDeleteClick = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		scheduleDeleteDialogOpen({
			pendingTimerRef: pendingOpenTimerRef.current,
			setShowDeleteDialog,
		});
	};

	return {
		showDeleteDialog,
		setShowDeleteDialog,
		handleDeleteClick,
	};
}
