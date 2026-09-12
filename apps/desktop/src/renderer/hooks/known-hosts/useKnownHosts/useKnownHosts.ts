import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { RouterOutputs } from "@superset/trpc";
import { useEffect, useMemo, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostEventBus } from "renderer/lib/host-event-bus";

type HostRow = RouterOutputs["host"]["roster"][number];

export type KnownHostRow = HostRow & { isOnline: boolean };

const NO_ROWS: HostRow[] = [];

/**
 * The org's hosts: the roster from the cloud, presence from the relay.
 *
 * The roster is membership, which changes only on a handful of mutations, so
 * it is fetched on mount, focus and reconnect, invalidated after the user's
 * own host mutations, and served from the persisted query cache on a cold or
 * offline boot. It is never polled.
 *
 * Presence is the state of each host's relay-routed event socket, which this
 * hook holds open for every host in the roster: the relay knows the instant a
 * host connects or drops, and the socket is the path the sidebar's data flows
 * over. The local host is observed through the relay too, so `isOnline` means
 * "reachable through the relay" for every row, which is what cloud-dispatched
 * work needs.
 */
export function useKnownHosts(): {
	hosts: KnownHostRow[];
	organizationId: string | null;
	/**
	 * True once the roster is trustworthy: the cloud answered, or the
	 * persisted cache restored it. Until then the list may be missing remote
	 * hosts entirely — gate "host/workspace doesn't exist" conclusions on
	 * this, never row rendering.
	 */
	settled: boolean;
} {
	const organizationId = useActiveOrganizationId();
	const relayUrl = useRelayUrl();
	const hostsQuery = cloudTrpc.host.roster.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: organizationId !== null,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
		},
	);
	const rows = hostsQuery.data ?? NO_ROWS;
	const presence = useRelayPresence(relayUrl, rows);
	const hosts = useMemo(
		() =>
			rows.map((row) => ({
				...row,
				isOnline: presence.get(row.machineId) ?? false,
			})),
		[rows, presence],
	);
	return { hosts, organizationId, settled: hostsQuery.data !== undefined };
}

function useRelayPresence(
	relayUrl: string,
	rows: HostRow[],
): Map<string, boolean> {
	const hostUrls = useMemo(
		() =>
			rows.map(
				(row) =>
					[
						row.machineId,
						`${relayUrl}/hosts/${buildHostRoutingKey(row.organizationId, row.machineId)}`,
					] as const,
			),
		[rows, relayUrl],
	);
	const [presence, setPresence] = useState<Map<string, boolean>>(
		() => new Map(),
	);
	useEffect(() => {
		const read = () =>
			new Map(
				hostUrls.map(([machineId, hostUrl]) => [
					machineId,
					getHostEventBus(hostUrl).getConnectionStatus().state === "open",
				]),
			);
		setPresence(read());
		const cleanups = hostUrls.map(([, hostUrl]) => {
			const bus = getHostEventBus(hostUrl);
			const release = bus.retain();
			const unsubscribe = bus.subscribeConnectionStatus(() =>
				setPresence(read()),
			);
			return () => {
				unsubscribe();
				release();
			};
		});
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [hostUrls]);
	return presence;
}
