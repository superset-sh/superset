import type { ReactNode } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { dispatchFsEvent } from "./fileDocumentStore";

export function FileDocumentStoreProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { workspace } = useWorkspace();
	useWorkspaceEvent("fs:events", workspace.id, (event) => {
		dispatchFsEvent(workspace.id, event);
	});

	return <>{children}</>;
}
