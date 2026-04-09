import { toast } from "@superset/ui/sonner";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

export function useCloseWorkspaces() {
  const utils = electronTrpc.useUtils();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const closeMutation = electronTrpc.workspaces.close.useMutation({
    onSettled: () => utils.workspaces.invalidate(),
  });

  const closeWorkspaces = useCallback(
    async (ids: string[]) => {
      // Navigate away if currently-viewed workspace is in selection
      if (params.workspaceId && ids.includes(params.workspaceId)) {
        const prevId = await utils.workspaces.getPreviousWorkspace.fetch({
          id: ids[0],
        });
        const nextId = await utils.workspaces.getNextWorkspace.fetch({
          id: ids[ids.length - 1],
        });
        const target = prevId ?? nextId;
        if (target && !ids.includes(target)) {
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
      const idsSet = new Set(ids);

      if (previousGrouped) {
        utils.workspaces.getAllGrouped.setData(
          undefined,
          previousGrouped
            .map((group) => ({
              ...group,
              workspaces: group.workspaces.filter((w) => !idsSet.has(w.id)),
              sections: group.sections.map((section) => ({
                ...section,
                workspaces: section.workspaces.filter((w) => !idsSet.has(w.id)),
              })),
              topLevelItems: group.topLevelItems.filter(
                (item) => !idsSet.has(item.id)
              ),
            }))
            .filter(
              (group) =>
                group.workspaces.length +
                  group.sections.reduce(
                    (sum, s) => sum + s.workspaces.length,
                    0
                  ) >
                0
            )
        );
      }
      if (previousAll) {
        utils.workspaces.getAll.setData(
          undefined,
          previousAll.filter((w) => !idsSet.has(w.id))
        );
      }

      // Close sequentially
      const toastId = toast.loading(`Hiding ${ids.length} workspaces...`);
      let successCount = 0;
      let failCount = 0;

      for (const id of ids) {
        try {
          await closeMutation.mutateAsync({ id });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        toast.success(`Hidden ${successCount} workspaces`, { id: toastId });
      } else {
        toast.warning(
          `Hidden ${successCount}, failed ${failCount} workspaces`,
          { id: toastId }
        );
      }

      await utils.workspaces.invalidate();
    },
    [utils, navigate, params.workspaceId, closeMutation]
  );

  return { closeWorkspaces };
}
