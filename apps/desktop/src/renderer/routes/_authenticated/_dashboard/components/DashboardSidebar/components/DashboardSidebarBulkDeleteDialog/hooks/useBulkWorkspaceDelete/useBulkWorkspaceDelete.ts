import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type DestroyWorkspaceError,
	type DestroyWorkspaceSuccess,
	destroyWorkspaceAtHost,
	inspectWorkspaceAtHost,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences/useV2UserPreferences";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import type { DashboardSidebarWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type BulkWorkspaceInspectionState,
	buildBulkWorkspaceInspectionSummary,
	executeBulkWorkspaceDeleteTargets,
} from "./bulkWorkspaceDelete";

interface UseBulkWorkspaceDeleteOptions {
	workspaces: DashboardSidebarWorkspace[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted: (workspaceIds: string[]) => void;
}

export interface BulkWorkspaceDeleteFailure {
	workspace: DashboardSidebarWorkspace;
	error: DestroyWorkspaceError;
}

export function bulkWorkspaceDestroyErrorMessage(
	workspace: DashboardSidebarWorkspace,
	error: DestroyWorkspaceError,
): string {
	const workspaceName = workspace.name || workspace.branch;
	if (error.kind === "teardown-failed") {
		return `${workspaceName}: teardown failed`;
	}
	if (error.kind === "host-unavailable") {
		return `${workspaceName}: host is unavailable`;
	}
	return `${workspaceName}: ${error.message}`;
}

export function useBulkWorkspaceDelete({
	workspaces,
	open,
	onOpenChange,
	onDeleted,
}: UseBulkWorkspaceDeleteOptions) {
	const { cache: hostWorkspacesCache } = useHostWorkspaces();
	const { markDeleting, clearDeleting } = useDeletingWorkspaces();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();
	const { preferences, setDeleteLocalBranch } = useV2UserPreferences();
	const [inspections, setInspections] = useState<
		ReadonlyMap<string, BulkWorkspaceInspectionState>
	>(() => new Map());
	const [isDeleting, setIsDeleting] = useState(false);
	const [completedCount, setCompletedCount] = useState(0);
	const [failures, setFailures] = useState<BulkWorkspaceDeleteFailure[]>([]);
	const inspectGeneration = useRef(0);
	const inFlight = useRef(false);

	const targetFor = useCallback(
		(workspace: DashboardSidebarWorkspace) => {
			const hostUrl = hostWorkspacesCache.resolveHostUrl(workspace.hostId);
			return {
				workspaceId: workspace.id,
				hostUrl,
				hostStatus: hostUrl ? ("ready" as const) : ("not-found" as const),
			};
		},
		[hostWorkspacesCache],
	);

	useEffect(() => {
		if (!open) {
			inspectGeneration.current += 1;
			setInspections(new Map());
			setCompletedCount(0);
			setFailures([]);
			return;
		}

		const generation = inspectGeneration.current + 1;
		inspectGeneration.current = generation;
		setInspections(
			new Map(
				workspaces.map((workspace) => [workspace.id, { status: "loading" }]),
			),
		);

		for (const workspace of workspaces) {
			void inspectWorkspaceAtHost(targetFor(workspace))
				.then((preview) => {
					if (inspectGeneration.current !== generation) return;
					setInspections((current) => {
						const next = new Map(current);
						next.set(workspace.id, { status: "ready", preview });
						return next;
					});
				})
				.catch(() => {
					if (inspectGeneration.current !== generation) return;
					setInspections((current) => {
						const next = new Map(current);
						next.set(workspace.id, { status: "error" });
						return next;
					});
				});
		}
	}, [open, targetFor, workspaces]);

	const inspectionSummary = useMemo(
		() => buildBulkWorkspaceInspectionSummary(workspaces, inspections),
		[inspections, workspaces],
	);

	const execute = useCallback(
		async ({
			targets,
			forceAll,
			retainedFailures,
		}: {
			targets: DashboardSidebarWorkspace[];
			forceAll: boolean;
			retainedFailures: BulkWorkspaceDeleteFailure[];
		}) => {
			if (inFlight.current || targets.length === 0) return;
			inFlight.current = true;
			setIsDeleting(true);
			setCompletedCount(0);

			const targetIds = new Set(targets.map((workspace) => workspace.id));
			let deletedIds: string[] = [];
			let selectionReconciled = false;
			try {
				for (const workspace of targets) markDeleting(workspace.id);
				for (const workspace of targets) {
					navigateAwayFromWorkspace(workspace.id, targetIds);
				}

				const nextFailures = [...retainedFailures];
				const warnings: string[] = [];
				const execution = await executeBulkWorkspaceDeleteTargets<
					DashboardSidebarWorkspace,
					DestroyWorkspaceSuccess,
					DestroyWorkspaceError
				>({
					targets,
					shouldForce: (workspace) => {
						const inspection = inspections.get(workspace.id);
						return (
							forceAll ||
							(inspection?.status === "ready" &&
								inspection.preview.canDelete &&
								(inspection.preview.hasChanges ||
									inspection.preview.hasUnpushedCommits))
						);
					},
					// "Delete without checking": a conflict on a workspace whose
					// preview never completed means the unverified worktree was
					// dirty — the user already consented, so force like the
					// single-workspace dialog does. Checked-clean races still
					// land in the failures pane.
					shouldRetryWithForce: (workspace, error) =>
						error.kind === "conflict" &&
						inspections.get(workspace.id)?.status !== "ready",
					destroy: (workspace, force) =>
						destroyWorkspaceAtHost(targetFor(workspace), {
							deleteBranch: preferences.deleteLocalBranch,
							force,
						}),
					onSettled: () => setCompletedCount((count) => count + 1),
				});
				deletedIds = execution.successes.map(({ workspace }) => workspace.id);

				for (const { workspace, result } of execution.successes) {
					hostWorkspacesCache.removeWorkspace(workspace.hostId, workspace.id);
					removeWorkspaceFromSidebar(workspace.id);
					warnings.push(...result.warnings);
				}
				nextFailures.push(...execution.failures);

				for (const warning of warnings) toast.warning(warning);
				if (deletedIds.length > 0) {
					onDeleted(deletedIds);
					selectionReconciled = true;
					toast.success(
						`Deleted ${deletedIds.length} ${deletedIds.length === 1 ? "workspace" : "workspaces"}`,
					);
				}
				if (nextFailures.length > 0) {
					toast.error(
						`Couldn’t delete ${nextFailures.length} ${nextFailures.length === 1 ? "workspace" : "workspaces"}`,
						{
							description: nextFailures
								.map(({ workspace, error }) =>
									bulkWorkspaceDestroyErrorMessage(workspace, error),
								)
								.join("\n"),
						},
					);
				}

				setFailures(nextFailures);
				if (nextFailures.length === 0) onOpenChange(false);
			} catch (error) {
				if (deletedIds.length > 0 && !selectionReconciled) {
					try {
						onDeleted(deletedIds);
					} catch (reconciliationError) {
						console.error(
							"[bulk-workspace-delete] Failed to reconcile deleted workspace selection",
							reconciliationError,
						);
					}
				}
				console.error(
					"[bulk-workspace-delete] Unexpected error during bulk workspace deletion",
					error,
				);
				toast.error(
					deletedIds.length > 0
						? "Deleted workspaces, but couldn’t finish updating the sidebar"
						: "Couldn’t finish deleting workspaces",
					{
						description:
							deletedIds.length > 0
								? "Reload Superset to refresh the workspace list."
								: "Try again. If the problem continues, reload Superset.",
					},
				);
			} finally {
				for (const workspace of targets) clearDeleting(workspace.id);
				setIsDeleting(false);
				inFlight.current = false;
			}
		},
		[
			clearDeleting,
			hostWorkspacesCache,
			inspections,
			markDeleting,
			navigateAwayFromWorkspace,
			onDeleted,
			onOpenChange,
			preferences.deleteLocalBranch,
			removeWorkspaceFromSidebar,
			targetFor,
		],
	);

	const run = useCallback(async () => {
		if (!inspectionSummary.canConfirm) return;
		setFailures([]);
		await execute({
			targets: workspaces,
			forceAll: false,
			retainedFailures: [],
		});
	}, [execute, inspectionSummary.canConfirm, workspaces]);

	const forceTeardownFailures = useCallback(async () => {
		const teardownFailures = failures.filter(
			(failure) => failure.error.kind === "teardown-failed",
		);
		if (teardownFailures.length === 0) return;
		const teardownWorkspaceIds = new Set(
			teardownFailures.map((failure) => failure.workspace.id),
		);
		await execute({
			targets: teardownFailures.map((failure) => failure.workspace),
			forceAll: true,
			retainedFailures: failures.filter(
				(failure) => !teardownWorkspaceIds.has(failure.workspace.id),
			),
		});
	}, [execute, failures]);

	return {
		completedCount,
		deleteBranch: preferences.deleteLocalBranch,
		failures,
		forceTeardownFailures,
		inspectionSummary,
		isDeleting,
		run,
		setDeleteBranch: setDeleteLocalBranch,
	};
}
