import { toast } from "@superset/ui/sonner";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

export function useCloseWorkspaces() {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();
	const params = useParams({ strict: false });
	const closeMutation = electronTrpc.workspaces.close.useMutation();

	const closeWorkspaces = useCallback(
		async (ids: string[]) => {
			const idsSet = new Set(ids);

			// Navigate away if currently-viewed workspace is in selection
			if (params.workspaceId && idsSet.has(params.workspaceId)) {
				const prevId = await utils.workspaces.getPreviousWorkspace.fetch({
					id: params.workspaceId,
				});
				const nextId = await utils.workspaces.getNextWorkspace.fetch({
					id: params.workspaceId,
				});
				const target =
					(prevId && !idsSet.has(prevId) ? prevId : null) ??
					(nextId && !idsSet.has(nextId) ? nextId : null);
				if (target) {
					navigateToWorkspace(target, navigate);
				} else {
					navigate({ to: "/workspace" });
				}
			}

			// Optimistically remove all workspaces from cache
			await Promise.all([
				utils.workspaces.getAll.cancel(),
				utils.workspaces.getAllGrouped.cancel(),
			]);

			const previousGrouped = utils.workspaces.getAllGrouped.getData();
			const previousAll = utils.workspaces.getAll.getData();
			const idsSetForFilter = idsSet;

			if (previousGrouped) {
				utils.workspaces.getAllGrouped.setData(
					undefined,
					previousGrouped
						.map((group) => ({
							...group,
							workspaces: group.workspaces.filter(
								(w) => !idsSetForFilter.has(w.id),
							),
							sections: group.sections.map((section) => ({
								...section,
								workspaces: section.workspaces.filter(
									(w) => !idsSetForFilter.has(w.id),
								),
							})),
							topLevelItems: group.topLevelItems.filter(
								(item) => !idsSetForFilter.has(item.id),
							),
						}))
						.filter(
							(group) =>
								group.workspaces.length +
									group.sections.reduce(
										(sum, s) => sum + s.workspaces.length,
										0,
									) >
								0,
						),
				);
			}
			if (previousAll) {
				utils.workspaces.getAll.setData(
					undefined,
					previousAll.filter((w) => !idsSetForFilter.has(w.id)),
				);
			}

			// Close sequentially
			const toastId = toast.loading(`Hiding ${ids.length} workspaces...`);
			let successCount = 0;
			let failCount = 0;

			try {
				for (const id of ids) {
					try {
						await closeMutation.mutateAsync({ id });
						successCount++;
					} catch (error) {
						console.warn("Failed to close workspace", { id, error });
						failCount++;
					}
				}
			} catch {
				// Rollback optimistic updates on unexpected failure
				if (previousGrouped !== undefined) {
					utils.workspaces.getAllGrouped.setData(undefined, previousGrouped);
				}
				if (previousAll !== undefined) {
					utils.workspaces.getAll.setData(undefined, previousAll);
				}
			}

			if (failCount === 0) {
				toast.success(`Hidden ${successCount} workspaces`, { id: toastId });
			} else {
				toast.warning(
					`Hidden ${successCount}, failed ${failCount} workspaces`,
					{ id: toastId },
				);
			}

			await utils.workspaces.invalidate();
		},
		[utils, navigate, params.workspaceId, closeMutation],
	);

	return { closeWorkspaces };
}
