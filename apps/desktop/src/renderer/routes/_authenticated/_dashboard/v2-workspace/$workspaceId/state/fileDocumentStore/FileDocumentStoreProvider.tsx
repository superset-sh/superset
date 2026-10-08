import type { WorkspaceStore } from "@superset/panes";
import type { FsWatchEvent } from "@superset/workspace-fs/client";
import { type ReactNode, useCallback } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { dispatchFsEvent } from "./fileDocumentStore";
import { FileMoveContext } from "./fileMoveContext";
import { renameFilePanePaths } from "./renameFilePanePaths";

export function FileDocumentStoreProvider({
	children,
	stores,
}: {
	children: ReactNode;
	stores: StoreApi<WorkspaceStore<PaneViewerData>>[];
}) {
	const { workspace } = useWorkspace();
	const handleFsEvent = useCallback(
		(event: FsWatchEvent) => {
			dispatchFsEvent(workspace.id, event);
			for (const store of stores) renameFilePanePaths(store, event);
		},
		[workspace.id, stores],
	);
	useWorkspaceEvent("fs:events", workspace.id, handleFsEvent);

	return (
		<FileMoveContext.Provider value={handleFsEvent}>
			{children}
		</FileMoveContext.Provider>
	);
}
