import {
	mcpHeadersHelperCommand,
	readEnabledPlugins,
	type SyncManagedMcpServersOptions,
	syncManagedMcpServers,
} from "@superset/agent-setup";
import { desiredPluginMcpServers } from "@superset/shared/plugins";

export function syncPluginMcpServers(
	options: SyncManagedMcpServersOptions = {},
): {
	servers: number;
	error: string | null;
} {
	if (process.env.NODE_ENV === "development")
		return { servers: 0, error: null };
	const enabled = readEnabledPlugins();
	// An unreadable ledger is not an empty one; syncing an empty desired set
	// would reap every managed server.
	if (!enabled)
		return { servers: 0, error: "installed_plugins.json is unreadable" };
	const desired = desiredPluginMcpServers(enabled, {
		headersHelper: mcpHeadersHelperCommand(),
	});
	try {
		syncManagedMcpServers(desired, options);
	} catch (error) {
		// A config linked into a read-only store (Nix home-manager and friends)
		// fails here by design. The skills are already materialized and the plugin
		// is installed, so this is reported, not thrown.
		return {
			servers: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	return { servers: Object.keys(desired).length, error: null };
}
