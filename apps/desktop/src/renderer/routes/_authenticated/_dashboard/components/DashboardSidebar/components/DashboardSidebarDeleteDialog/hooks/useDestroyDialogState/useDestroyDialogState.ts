import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import type { DestroyWorkspaceSuccess } from "renderer/hooks/host-service/useDestroyWorkspace";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";

const STATUS_STALE_TIME_MS = 5_000;

interface UseDestroyDialogStateOptions {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { destroy } = useDestroyWorkspace(workspaceId);
	const { markDeleting, clearDeleting } = useDeletingWorkspaces();
	const navigateAway = useNavigateAwayFromWorkspace();

	const { preferences, setDeleteLocalBranch: setDeleteBranch } =
		useV2UserPreferences();
	const deleteBranch = preferences.deleteLocalBranch;

	const { data: canDeleteData, isPending: isCheckingStatus } =
		electronTrpc.workspaces.canDelete.useQuery(
			{ id: workspaceId },
			{
				enabled: open,
				staleTime: STATUS_STALE_TIME_MS,
				refetchOnWindowFocus: false,
			},
		);
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;

	const [error, setError] = useState<DestroyWorkspaceError | null>(null);
	const inFlight = useRef(false);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) setError(null);
			onOpenChange(next);
		},
		[onOpenChange],
	);

	const run = useCallback(
		async (force: boolean) => {
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
				let result: DestroyWorkspaceSuccess;
				try {
					result = await destroy({ deleteBranch, force });
				} catch (firstErr) {
					const e = firstErr as DestroyWorkspaceError;
					// Race: preflight said clean but worktree was dirty by the time
					// destroy ran. The user already confirmed once — don't make them
					// confirm a second "uncommitted changes" warning, just force.
					if (e.kind === "conflict" && !force) {
						result = await destroy({ deleteBranch, force: true });
					} else {
						throw firstErr;
					}
				}
				for (const warning of result.warnings) toast.warning(warning);
				onDeleted?.();
			} catch (err) {
				const e = err as DestroyWorkspaceError;
				if (e.kind === "teardown-failed") {
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
		hasChanges,
		hasUnpushedCommits,
		isCheckingStatus,
		error,
		handleOpenChange,
		run,
	};
}
