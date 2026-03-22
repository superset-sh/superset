import { useEffect } from "react";
import { retainWorkspaceFsBridge } from "../../lib/workspaceFsEventRegistry";
import { useWorkspaceClient } from "../../providers/WorkspaceClientProvider";

export function useWorkspaceFsEventBridge(
	workspaceId: string,
	enabled = true,
): void {
	const client = useWorkspaceClient();

	useEffect(() => {
		if (!enabled || !workspaceId) {
			return;
		}

		return retainWorkspaceFsBridge(client, workspaceId);
	}, [client, enabled, workspaceId]);
}
