import {
	mcpHeadersHelperCommand,
	readEnabledPlugins,
	readPluginConnections,
	type SyncManagedMcpServersOptions,
	syncManagedMcpServers,
	writePluginConnections,
} from "@superset/agent-setup";
import { desiredPluginMcpServers } from "@superset/shared/plugins";
import type { ApiClient } from "../api-client";

/**
 * Converges this machine's agent MCP configs on the installed set, reaping what
 * is no longer wanted. Offline by construction: the account list comes from the
 * cache `refreshPluginConnectionsCache` leaves behind, so `plugins sync` works
 * on a plane and a stale cache only costs the one-entry-per-connector shape.
 */
export function syncPluginMcpServers(
	options: SyncManagedMcpServersOptions = {},
): {
	servers: number;
	error: string | null;
} {
	const plugins = readEnabledPlugins();
	if (!plugins)
		return { servers: 0, error: "installed_plugins.json is unreadable" };
	const desired = desiredPluginMcpServers(plugins, {
		connections: readPluginConnections(),
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

/**
 * Refreshes the cached account list from the API, so a machine the desktop never
 * ran on still splits a two-account connector into one entry each.
 *
 * `connectors.status` rather than the plugin catalog because the entry names are
 * built from `externalUserId`, which only it carries: a writer that fell back to
 * connection ids would rename every entry the other writer had just named, and
 * each rename orphans the token the agent stored against the old name.
 */
export async function refreshPluginConnectionsCache(
	api: ApiClient,
): Promise<boolean> {
	try {
		const organization = await api.user.myOrganization.query();
		if (!organization) return false;
		const rows = await api.connectors.status.query({
			organizationId: organization.id,
		});
		writePluginConnections(
			rows.map((row) => ({
				connector: row.connector,
				connectionId: row.id,
				externalUserId: row.externalUserId,
				nickname: row.nickname,
				label: row.externalUserLabel ?? row.externalAccountLabel,
			})),
		);
		return true;
	} catch {
		// Offline, or a token that no longer works. The cache keeps whatever it
		// had, which is better than an install failing over MCP naming.
		return false;
	}
}
