import { useCallback, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { usePluginMutations } from "../usePluginMutations";

/** Installs the plugin once its connector has an account, read fresh from the API. */
export function useInstallAfterConnect() {
	const utils = cloudTrpc.useUtils();
	const { install } = usePluginMutations();
	const inFlight = useRef(new Set<string>());

	return useCallback(
		async (pluginName: string) => {
			if (inFlight.current.has(pluginName)) return;
			inFlight.current.add(pluginName);
			try {
				const rows = await utils.plugins.list.fetch(undefined, {
					staleTime: 0,
				});
				const row = rows.find((entry) => entry.name === pluginName);
				const connected = Boolean(row?.connector && row.connections.length > 0);
				const installed = Boolean(row?.installed && row.enabled);
				if (connected && !installed)
					await install(pluginName, row?.marketplace);
			} finally {
				inFlight.current.delete(pluginName);
			}
		},
		[install, utils],
	);
}
