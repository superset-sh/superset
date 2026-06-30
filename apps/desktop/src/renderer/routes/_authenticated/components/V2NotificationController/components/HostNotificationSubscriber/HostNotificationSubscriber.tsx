import type { WorkspaceState } from "@superset/panes";
import type {
	AgentLifecyclePayload,
	TerminalLifecyclePayload,
} from "@superset/workspace-client";
import { getEventBus } from "@superset/workspace-client";
import { useEffect, useEffectEvent, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { deriveV2HydrationUpdates } from "../../lib/hydrateAgentStatus";
import {
	handleV2AgentLifecycleEvent,
	handleV2TerminalLifecycleEvent,
} from "../../lib/lifecycleEvents";

export interface HostNotificationWorkspaceState {
	workspaceId: string;
	workspaceName: string;
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
			handleV2AgentLifecycleEvent({
				workspaceId,
				workspaceName: workspace.workspaceName,
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
			handleV2TerminalLifecycleEvent({
				workspaceId,
				payload,
			});
		},
	);

	// Live `agent:lifecycle` events only carry state from this point forward, so
	// an agent that started working before the bus connected (the common case
	// for a remote host, whose relay subscription comes online well after the
	// agent began) would leave the sidebar indicator static. Seed the store from
	// the host's current agent bindings so the indicator reflects in-flight work.
	useEffect(() => {
		let cancelled = false;
		const client = getHostServiceClientByUrl(hostUrl);
		void Promise.all(
			workspaces.map(async (workspace) => {
				try {
					const bindings = await client.terminalAgents.listByWorkspace.query({
						workspaceId: workspace.workspaceId,
					});
					if (cancelled) return;
					const store = useV2NotificationStore.getState();
					const updates = deriveV2HydrationUpdates({
						bindings,
						existingSources: store.sources,
					});
					for (const update of updates) {
						store.setSourceStatus(
							update.source,
							workspace.workspaceId,
							update.status,
							update.occurredAt,
						);
					}
				} catch {
					// Host unreachable or the query failed — live events will
					// populate the status once the agent emits its next event.
				}
			}),
		);
		return () => {
			cancelled = true;
		};
	}, [hostUrl, workspaces]);

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
