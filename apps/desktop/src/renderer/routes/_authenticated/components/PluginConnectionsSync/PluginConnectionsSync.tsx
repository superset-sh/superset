import { useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Pushes live connections to main, which rewrites the plugin MCP entries from
 * them. Watches the whole set rather than hooking connect and disconnect, so a
 * connection made on the web or another machine lands here too.
 */
export function PluginConnectionsSync() {
	const myOrganization = cloudTrpc.user.myOrganization.useQuery(undefined, {
		staleTime: Number.POSITIVE_INFINITY,
	});
	const organizationId = myOrganization.data?.id ?? "";

	const status = cloudTrpc.connectors.status.useQuery(
		{ organizationId },
		{ enabled: Boolean(organizationId), refetchOnWindowFocus: true },
	);

	const { mutate } = electronTrpc.plugins.syncConnections.useMutation();
	const lastSynced = useRef<string | null>(null);

	useEffect(() => {
		if (!status.data) return;
		const connections = status.data.map((row) => ({
			connector: row.connector,
			connectionId: row.id,
			externalUserId: row.externalUserId,
			nickname: row.nickname,
			label: row.externalUserLabel ?? row.externalAccountLabel,
		}));
		const fingerprint = JSON.stringify(connections);
		if (fingerprint === lastSynced.current) return;
		lastSynced.current = fingerprint;
		mutate({ connections });
	}, [status.data, mutate]);

	return null;
}
