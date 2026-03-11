import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useChangesStore } from "renderer/stores/changes";
import { useTabsStore } from "renderer/stores/tabs/store";

interface UseWorkspaceRenameReconciliationOptions {
	workspaceId: string;
	worktreePath?: string;
	enabled?: boolean;
}

export function useWorkspaceRenameReconciliation({
	workspaceId,
	worktreePath,
	enabled = true,
}: UseWorkspaceRenameReconciliationOptions): void {
	const retargetFileViewerPaths = useTabsStore(
		(store) => store.retargetFileViewerPaths,
	);
	const retargetSelectedFile = useChangesStore(
		(store) => store.retargetSelectedFile,
	);

	useWorkspaceFileEvents(
		workspaceId,
		(event) => {
			if (
				event.type !== "rename" ||
				!event.absolutePath ||
				!event.oldAbsolutePath ||
				!worktreePath
			) {
				return;
			}

			retargetFileViewerPaths(
				workspaceId,
				event.oldAbsolutePath,
				event.absolutePath,
				Boolean(event.isDirectory),
			);
			retargetSelectedFile(
				workspaceId,
				event.oldAbsolutePath,
				event.absolutePath,
				worktreePath,
				Boolean(event.isDirectory),
			);
		},
		enabled && Boolean(workspaceId && worktreePath),
	);
}
