import type { ReactNode } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { dispatchFsEvent } from "./fileDocumentStore";

interface FileDocumentStoreProviderProps {
	workspaceId: string;
	children: ReactNode;
}

export function FileDocumentStoreProvider({
	workspaceId,
	children,
}: FileDocumentStoreProviderProps) {
	useWorkspaceEvent("fs:events", workspaceId, (event) => {
		dispatchFsEvent(workspaceId, event);
	});

	return <>{children}</>;
}
