import { deferDeleteDialogOpen } from "./deferDeleteDialogOpen";

export interface PendingDeleteDialogTimerRef {
	current: ReturnType<typeof setTimeout> | null;
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
