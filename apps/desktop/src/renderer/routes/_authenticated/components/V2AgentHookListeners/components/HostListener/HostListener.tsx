import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { getEventBus } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import {
	handleV2AgentLifecycleEvent,
	handleV2TerminalLifecycleEvent,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2AgentHookListener";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export interface HostWorkspaceListenerState {
	workspaceId: string;
	paneLayout: WorkspaceState<PaneViewerData> | null;
}

export function HostListener({
	hostUrl,
	workspaces,
}: {
	hostUrl: string;
	workspaces: HostWorkspaceListenerState[];
}): null {
	const navigate = useNavigate();
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
			handleV2AgentLifecycleEvent({
				workspaceId,
				payload,
				paneLayout: workspace.paneLayout,
				volume,
				muted,
				navigate,
			});
		},
	);

	const handleTerminalLifecycle = useEffectEvent(
		(workspaceId: string, payload: TerminalLifecyclePayload) => {
			const workspace = workspacesById.get(workspaceId);
			if (!workspace) return;
			handleV2TerminalLifecycleEvent({
				workspaceId,
				payload,
				paneLayout: workspace.paneLayout,
			});
		},
	);

	useEffect(() => {
		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
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
