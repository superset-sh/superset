import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	DestroyWorkspacePreview,
	DestroyWorkspaceSuccess,
} from "renderer/hooks/host-service/useDestroyWorkspace";
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
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

type InspectState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; preview: DestroyWorkspacePreview }
	| { status: "error" };

export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { destroy, inspect, hostTarget } = useDestroyWorkspace(workspaceId);
	const { markDeleting, clearDeleting } = useDeletingWorkspaces();
	const navigateAway = useNavigateAwayFromWorkspace();

	const { preferences, setDeleteLocalBranch: setDeleteBranch } =
		useV2UserPreferences();
	const deleteBranch = preferences.deleteLocalBranch;

	const [inspectState, setInspectState] = useState<InspectState>({
		status: "idle",
	});
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);
	const inFlight = useRef(false);

	// Run inspect when the dialog opens AND the host is ready. Distinguish
	// transient pending-host states (loading / local-starting → silent
	// "Checking…") from terminal ones (not-found → blocking banner) so the
	// user can't sit in a forever-disabled dialog.
	useEffect(() => {
		if (!open) {
			setInspectState({ status: "idle" });
			return;
		}
		if (
			hostTarget.status === "loading" ||
			hostTarget.status === "local-starting"
		) {
			setInspectState({ status: "loading" });
			return;
		}
		if (hostTarget.status === "not-found") {
			setInspectState({
				status: "ready",
				preview: {
					canDelete: false,
					reason: "Workspace is no longer available on this host.",
					hasChanges: false,
					hasUnpushedCommits: false,
				},
			});
			return;
		}

		let cancelled = false;
		setInspectState({ status: "loading" });
		inspect()
			.then((preview) => {
				if (cancelled) return;
				setInspectState({ status: "ready", preview });
			})
			.catch(() => {
				if (cancelled) return;
				// Inspect-failure is non-fatal — let the user attempt destroy and
				// surface real errors there. Treat as "no warnings, no block".
				setInspectState({ status: "error" });
			});

		return () => {
			cancelled = true;
		};
	}, [open, hostTarget.status, inspect]);

	const preview = inspectState.status === "ready" ? inspectState.preview : null;

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
					// Silent force-retry on the dirty-worktree race: preflight said
					// clean but the worktree was dirty by destroy time. The user
					// already confirmed once — don't bounce them back through a
					// second warning. Do NOT extend this to `in-progress` (that's
					// a different CONFLICT cause; retrying just races the same
					// guard).
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
				} else if (e.kind === "in-progress") {
					toast.error(`A delete is already in progress for ${workspaceName}.`);
				} else {
					toast.error(
						`Failed to delete ${workspaceName}: ${"message" in e ? e.message : String(e.kind)}`,
					);
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
		hasChanges: preview?.hasChanges ?? false,
		hasUnpushedCommits: preview?.hasUnpushedCommits ?? false,
		canConfirm: preview ? preview.canDelete : true,
		blockingReason: preview && !preview.canDelete ? preview.reason : null,
		isCheckingStatus: open && inspectState.status === "loading",
		error,
		handleOpenChange,
		run,
	};
}
