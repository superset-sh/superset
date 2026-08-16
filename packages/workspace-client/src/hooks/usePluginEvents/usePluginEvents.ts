import { useEffect, useEffectEvent } from "react";
import { getEventBus, type PluginEventPayload } from "../../lib/eventBus";
import { useWorkspaceClient } from "../../providers/WorkspaceClientProvider";

/**
 * Subscribe to `plugin:event` payloads published by a plugin backend via
 * `api.realtime.publish` (or all plugins with "*").
 */
export function usePluginEvents(
	pluginId: string | "*",
	onEvent: (pluginId: string, payload: PluginEventPayload) => void,
	enabled = true,
): void {
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const handler = useEffectEvent(onEvent);

	useEffect(() => {
		if (!enabled) return;

		const bus = getEventBus(hostUrl, getWsToken);
		return bus.on("plugin:event", pluginId, (id, payload) => {
			handler(id, payload);
		});
	}, [hostUrl, getWsToken, pluginId, enabled]);
}
