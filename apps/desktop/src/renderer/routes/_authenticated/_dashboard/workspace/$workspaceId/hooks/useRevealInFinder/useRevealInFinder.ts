import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Reveals a path in Finder: folders open directly (like `open <path>`),
 * files get highlighted in their parent folder. Guards remote workspaces
 * whose paths don't exist on this machine.
 */
export function useRevealInFinder(workspaceId: string) {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const { workspaces } = useHostWorkspaces();
	const workspaceRow = workspaces.find((w) => w.id === workspaceId);

	return useCallback(
		(path: string, options?: { isDirectory?: boolean }) => {
			if (workspaceRow?.hostId !== machineId) {
				toast.error(
					t({
						message: "Can't open remote workspace paths in Finder",
					}),
				);
				return;
			}
			const procedure = options?.isDirectory
				? electronTrpcClient.external.openFolderInFinder
				: electronTrpcClient.external.openInFinder;
			procedure.mutate(path).catch((error) => {
				console.error("Failed to reveal path in Finder:", path, error);
				toast.error(
					t({
						message: "Failed to reveal in Finder",
					}),
				);
			});
		},
		[workspaceRow, machineId, t],
	);
}
