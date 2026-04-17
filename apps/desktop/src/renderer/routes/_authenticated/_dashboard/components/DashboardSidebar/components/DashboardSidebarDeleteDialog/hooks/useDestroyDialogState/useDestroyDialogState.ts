import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";

interface UseDestroyDialogStateOptions {
	workspaceId: string;
	workspaceName: string;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

/**
 * Drives the delete flow for `DashboardSidebarDeleteDialog`.
 *
 * UX pattern (mirrors v1's deleteWithToast):
 *   - On confirm, close the dialog immediately and run the destroy
 *     in the background under a toast.loading → success/error.
 *   - For decision-required errors (CONFLICT, TEARDOWN_FAILED) we
 *     reopen the dialog in the matching error pane so the user can
 *     force-retry with full context. The branch opt-in is preserved.
 *   - For unknown errors we just toast.error — no reopen.
 */
export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { destroy } = useDestroyWorkspace(workspaceId);

	const [deleteBranch, setDeleteBranch] = useState(false);
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);
	const inFlight = useRef(false);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				setDeleteBranch(false);
				setError(null);
			}
			onOpenChange(next);
		},
		[onOpenChange],
	);

	const clearError = useCallback(() => setError(null), []);

	const run = useCallback(
		async (force: boolean) => {
			// Guard against double-submit: optimistic close + async mutate means
			// a rapid second click (from the same pane or a re-opened error pane)
			// could fire destroy twice before the first resolves.
			if (inFlight.current) return;
			inFlight.current = true;

			// Optimistic close. State (deleteBranch) preserved in case we re-open
			// on a decision-required error.
			setError(null);
			onOpenChange(false);

			const loadingId = toast.loading(`Deleting ${workspaceName}...`);

			try {
				const result = await destroy({ deleteBranch, force });
				toast.success(`Deleted ${workspaceName}`, { id: loadingId });
				for (const warning of result.warnings) toast.warning(warning);
				setDeleteBranch(false);
				onDeleted?.();
			} catch (err) {
				const e = err as DestroyWorkspaceError;
				if (e.kind === "conflict" || e.kind === "teardown-failed") {
					toast.dismiss(loadingId);
					setError(e);
					onOpenChange(true);
				} else {
					toast.error(`Failed to delete: ${e.message}`, { id: loadingId });
				}
			} finally {
				inFlight.current = false;
			}
		},
		[destroy, deleteBranch, workspaceName, onOpenChange, onDeleted],
	);

	return {
		deleteBranch,
		setDeleteBranch,
		error,
		clearError,
		handleOpenChange,
		run,
	};
}
