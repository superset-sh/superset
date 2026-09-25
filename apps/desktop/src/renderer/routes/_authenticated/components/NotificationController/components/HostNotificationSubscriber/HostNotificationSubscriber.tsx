import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { useEffect, useEffectEvent, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import {
	handleAgentLifecycleEvent,
	handleTerminalLifecycleEvent,
} from "../../lib/lifecycleEvents";

export interface HostNotificationWorkspaceState {
	workspaceId: string;
	workspaceName: string;
	projectName?: string;
	paneLayout: WorkspaceState<PaneViewerData> | null;
}

export function HostNotificationSubscriber({
	hostUrl,
	workspaces,
}: {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}): null {
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const workspacesById = useMemo(
		() =>
			new Map(
				workspaces.map((workspace) => [workspace.workspaceId, workspace]),
			),
		[workspaces],
	);

	const handleAgentLifecycle = useEffectEvent(
		(workspaceId: string, payload: AgentLifecyclePayload) => {
			const workspace = workspacesById.get(workspaceId);
			if (!workspace) return;
			handleAgentLifecycleEvent({
				workspaceId,
				workspaceName: workspace.workspaceName,
				projectName: workspace.projectName,
				payload,
				paneLayout: workspace.paneLayout,
				volume,
				muted,
			});
		},
	);

	const handleTerminalLifecycle = useEffectEvent(
		(workspaceId: string, payload: TerminalLifecyclePayload) => {
			const workspace = workspacesById.get(workspaceId);
			if (!workspace) return;
			handleTerminalLifecycleEvent({ payload });
		},
	);

	useEffect(() => {
		const bus = getHostEventBus(hostUrl);
		const removeAgentListener = bus.on(
			"agent:lifecycle",
			"*",
			handleAgentLifecycle,
		);
		const removeTerminalListener = bus.on(
			"terminal:lifecycle",
			"*",
			handleTerminalLifecycle,
		);
		const release = bus.retain();

		return () => {
			removeAgentListener();
			removeTerminalListener();
			release();
		};
	}, [hostUrl]);

	return null;
}
