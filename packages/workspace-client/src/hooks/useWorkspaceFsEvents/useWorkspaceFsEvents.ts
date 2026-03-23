import { useEffect, useEffectEvent } from "react";
import type { WorkspaceFsEventListener } from "../../lib/workspaceFsEventRegistry";
import { subscribeToWorkspaceFsEvents } from "../../lib/workspaceFsEventRegistry";
import { useWorkspaceClient } from "../../providers/WorkspaceClientProvider";

export function useWorkspaceFsEvents(
	workspaceId: string,
	listener: WorkspaceFsEventListener,
	enabled = true,
): void {
	const client = useWorkspaceClient();
	const onEvent = useEffectEvent(listener);

	useEffect(() => {
		if (!enabled || !workspaceId) {
			return;
		}

		return subscribeToWorkspaceFsEvents(client, workspaceId, (event) => {
			onEvent(event);
		});
	}, [client, enabled, workspaceId]);
}
