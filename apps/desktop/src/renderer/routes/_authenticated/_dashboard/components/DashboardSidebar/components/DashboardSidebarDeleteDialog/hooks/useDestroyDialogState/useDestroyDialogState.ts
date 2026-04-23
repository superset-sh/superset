import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences/useV2UserPreferences";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";

interface UseDestroyDialogStateOptions {
	workspaceId: string;
	workspaceName: string;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

/**
 * Drives the delete flow for `DashboardSidebarDeleteDialog`.
 *
 * UX pattern:
 *   - On confirm, navigate off the workspace first (if viewing it),
 *     close the dialog, mark the workspace deleting (row hides
 *     optimistically), fire a one-shot "Deleting..." toast, and let
 *     destroy run in the background. A loading toast across the 10–20s
 *     teardown feels worse than fire-and-forget + hidden row.
 *   - On success, `onDeleted` removes the row from sidebar state.
 *   - On error, `clearDeleting` runs in the `finally` block so the row
 *     reappears. For decision-required errors (CONFLICT, TEARDOWN_FAILED)
 *     we reopen the dialog in the matching error pane so the user can
 *     force-retry with full context.
 *   - For unknown errors we just toast.error — no reopen.
 */
export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { destroy } = useDestroyWorkspace(workspaceId);
	const { markDeleting, clearDeleting } = useDeletingWorkspaces();
	const navigateAway = useNavigateAwayFromWorkspace();

	const { preferences, setDeleteLocalBranch: setDeleteBranch } =
		useV2UserPreferences();
	const deleteBranch = preferences.deleteLocalBranch;
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);
	const inFlight = useRef(false);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) setError(null);
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

			// Navigate off the doomed workspace FIRST. Closing the dialog
			// and hiding the row were swallowing the nav otherwise.
			navigateAway(workspaceId);

			setError(null);
			onOpenChange(false);
			markDeleting(workspaceId);
			toast(`Deleting "${workspaceName}"...`);

			try {
				const result = await destroy({ deleteBranch, force });
				for (const warning of result.warnings) toast.warning(warning);
				onDeleted?.();
			} catch (err) {
				const e = err as DestroyWorkspaceError;
				if (e.kind === "conflict" || e.kind === "teardown-failed") {
					setError(e);
					onOpenChange(true);
				} else {
					toast.error(`Failed to delete ${workspaceName}: ${e.message}`);
				}
			} finally {
				clearDeleting(workspaceId);
				inFlight.current = false;
			}
		},
		[
			destroy,
			deleteBranch,
			workspaceName,
			workspaceId,
			onOpenChange,
			onDeleted,
			markDeleting,
			clearDeleting,
			navigateAway,
		],
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
