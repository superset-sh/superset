import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
import {
	type BulkWorkspaceDeleteFailure,
	useBulkDeleteWorkspacesIntent,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/stores/bulkDeleteWorkspacesIntent";
import type { DashboardSidebarWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import { useDeletingWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type BulkWorkspaceInspectionState,
	buildBulkWorkspaceInspectionSummary,
	executeBulkWorkspaceDeleteTargets,
} from "./bulkWorkspaceDelete";

interface UseBulkWorkspaceDeleteOptions {
	requestId: number;
	workspaces: DashboardSidebarWorkspace[];
	onDeleted: (workspaceIds: string[]) => void;
}

export type { BulkWorkspaceDeleteFailure };

export function bulkWorkspaceDestroyErrorMessage(
	workspace: DashboardSidebarWorkspace,
	error: DestroyWorkspaceError,
): string {
	const workspaceName = workspace.name || workspace.branch;
	if (error.kind === "teardown-failed") {
		return i18n._({
			...msg({
				message: "{workspaceName}: teardown failed",
			}),
			values: { workspaceName },
		});
	}
	if (error.kind === "host-unavailable") {
		return i18n._({
			...msg({
				message: "{workspaceName}: host is unavailable",
			}),
			values: { workspaceName },
		});
	}
	return `${workspaceName}: ${error.message}`;
}

/**
 * Confirm-pane state plus the destroy run for one bulk delete request.
 *
 * Confirming hides the dialog at once and runs the destroys in the
 * background behind a progress toast, the same shape as the single delete:
 * a bulk delete runs every teardown script serially and can take minutes,
 * and a modal open that long blocks the whole app. The request's phase and
 * failures live in the intent store, not here: the sidebar (and with it this
 * hook) unmounts when toggled closed, and the run must still surface its
 * failures pane once it is back instead of asking for confirmation again.
 */
export function useBulkWorkspaceDelete({
	requestId,
	workspaces,
	onDeleted,
}: UseBulkWorkspaceDeleteOptions) {
	const { t } = useLingui();
	const { cache: hostWorkspacesCache } = useHostWorkspaces();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const { removeWorkspaceFromSidebar } = useDashboardSidebarState();
	const { preferences, setDeleteLocalBranch } = useV2UserPreferences();
	const phase = useBulkDeleteWorkspacesIntent((s) => s.phase);
	const failures = useBulkDeleteWorkspacesIntent((s) => s.failures);
	const [inspections, setInspections] = useState<
		ReadonlyMap<string, BulkWorkspaceInspectionState>
	>(() => new Map());
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

		return () => {
			inspectGeneration.current += 1;
		};
	}, [targetFor, workspaces]);

	const inspectionSummary = useMemo(
		() => buildBulkWorkspaceInspectionSummary(workspaces, inspections),
		[inspections, workspaces],
	);

	const close = useCallback(
		() => useBulkDeleteWorkspacesIntent.getState().close(requestId),
		[requestId],
	);
	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) close();
		},
		[close],
	);

	const execute = useCallback(
		async ({
			targets,
			forceAll,
			skipTeardown,
			retainedFailures,
		}: {
			targets: DashboardSidebarWorkspace[];
			forceAll: boolean;
			/** Only the teardown-failure retry pass abandons teardown; warned
			 * (forced) deletes still run it. */
			skipTeardown: boolean;
			retainedFailures: BulkWorkspaceDeleteFailure[];
		}) => {
			if (inFlight.current || targets.length === 0) return;
			inFlight.current = true;
			// Hide whichever pane confirmed (confirm or failures): the run
			// continues in the background and re-raises the failures pane if
			// anything is left over.
			const intent = useBulkDeleteWorkspacesIntent.getState();
			intent.markRunning(requestId);

			const total = targets.length;
			// Both placeholders stay positional expressions so the catalog keeps
			// the dialog-era "{0} of {1}" shape and its translations.
			const progressMessage = (completed: number) =>
				t({
					message: `Deleting ${Math.min(completed + 1, total)} of ${targets.length}…`,
				});
			const progressToastId = toast.loading(progressMessage(0));

			const targetIds = new Set(targets.map((workspace) => workspace.id));
			let deletedIds: string[] = [];
			let selectionReconciled = false;
			try {
				for (const workspace of targets) {
					useDeletingWorkspacesStore.getState().markDeleting(workspace.id);
				}
				for (const workspace of targets) {
					navigateAwayFromWorkspace(workspace.id, targetIds);
				}

				const nextFailures = [...retainedFailures];
				const warnings: string[] = [];
				let completedCount = 0;
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
							skipTeardown,
						}),
					onSettled: () => {
						completedCount += 1;
						if (completedCount < total) {
							toast.loading(progressMessage(completedCount), {
								id: progressToastId,
							});
						}
					},
				});
				deletedIds = execution.successes.map(({ workspace }) => workspace.id);

				for (const { workspace, result } of execution.successes) {
					hostWorkspacesCache.removeWorkspace(workspace.hostId, workspace.id);
					removeWorkspaceFromSidebar(workspace.id);
					warnings.push(...result.warnings);
				}
				nextFailures.push(...execution.failures);

				if (deletedIds.length > 0) {
					onDeleted(deletedIds);
					selectionReconciled = true;
					toast.success(
						t({
							message: plural(deletedIds.length, {
								one: "Deleted # workspace",
								other: "Deleted # workspaces",
							}),
						}),
						{ id: progressToastId },
					);
				} else {
					toast.dismiss(progressToastId);
				}
				for (const warning of warnings) toast.warning(warning);
				if (nextFailures.length > 0) {
					toast.error(
						t({
							message: plural(nextFailures.length, {
								one: "Couldn’t delete # workspace",
								other: "Couldn’t delete # workspaces",
							}),
						}),
						{
							description: nextFailures
								.map(({ workspace, error }) =>
									bulkWorkspaceDestroyErrorMessage(workspace, error),
								)
								.join("\n"),
						},
					);
					intent.markFailed(requestId, nextFailures);
				} else {
					intent.close(requestId);
				}
			} catch (error) {
				toast.dismiss(progressToastId);
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
						? t({
								message:
									"Deleted workspaces, but couldn’t finish updating the sidebar",
							})
						: t({
								message: "Couldn’t finish deleting workspaces",
							}),
					{
						description:
							deletedIds.length > 0
								? t({
										message: "Reload Superset to refresh the workspace list.",
									})
								: t({
										message:
											"Try again. If the problem continues, reload Superset.",
									}),
					},
				);
				intent.close(requestId);
			} finally {
				for (const workspace of targets) {
					useDeletingWorkspacesStore.getState().clearDeleting(workspace.id);
				}
				inFlight.current = false;
			}
		},
		[
			hostWorkspacesCache,
			inspections,
			navigateAwayFromWorkspace,
			onDeleted,
			preferences.deleteLocalBranch,
			removeWorkspaceFromSidebar,
			requestId,
			t,
			targetFor,
		],
	);

	const run = useCallback(async () => {
		if (!inspectionSummary.canConfirm) return;
		await execute({
			targets: workspaces,
			forceAll: false,
			skipTeardown: false,
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
			skipTeardown: true,
			retainedFailures: failures.filter(
				(failure) => !teardownWorkspaceIds.has(failure.workspace.id),
			),
		});
	}, [execute, failures]);

	return {
		phase,
		close,
		handleOpenChange,
		deleteBranch: preferences.deleteLocalBranch,
		failures,
		forceTeardownFailures,
		inspectionSummary,
		run,
		setDeleteBranch: setDeleteLocalBranch,
	};
}
