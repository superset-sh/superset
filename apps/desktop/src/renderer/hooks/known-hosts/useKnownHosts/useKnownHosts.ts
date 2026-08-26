import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type KnownHostRow,
	loadKnownHostsSnapshot,
	resolveKnownHosts,
	saveKnownHostsSnapshot,
} from "./useKnownHosts.utils";

export type { KnownHostRow } from "./useKnownHosts.utils";

/**
 * Org host list for query-target derivation, decoupled from the cloud query's
 * fetch lifecycle. `v2Host.list` stays the live source, but its rows are
 * persisted to IndexedDB and served from that snapshot whenever the query has
 * no data yet (cold start before the first response, offline boot). A settled
 * empty response is authoritative: the snapshot must not resurrect an org's
 * deleted last host.
 *
 * Without this, an empty read empties the host target list and every
 * host-derived read path (workspaces, projects, PR chips, ports) drops its
 * rows — a full sidebar clear (verified 2026-08-01; see
 * apps/desktop/docs/SIDEBAR_STATE_RESILIENCE.md).
 */
export function useKnownHosts(): {
	hosts: KnownHostRow[];
	organizationId: string | null;
	/**
	 * True once the host list is trustworthy: the cloud query answered, or this
	 * org's IndexedDB snapshot loaded. Until then the list may be missing
	 * remote hosts entirely — gate "host/workspace doesn't exist" conclusions
	 * on this, never row rendering.
	 */
	settled: boolean;
} {
	const organizationId = useActiveOrganizationId();

	// Presence drives the fan-out targets the sidebar polls while the window is
	// backgrounded, so this refresh has to keep running there too.
	const hostsQuery = cloudTrpc.v2Host.list.useQuery(undefined, {
		refetchInterval: 30_000,
		refetchIntervalInBackground: true,
	});
	// The query key carries no org (the server scopes by active org), so right
	// after a switch this cache entry still holds the prior org's rows. Rows
	// carry their owning org: a non-empty response with no row for the active
	// org is a foreign read, not an answer for this org.
	const hostRows = hostsQuery.data;
	const liveReady =
		hostRows !== undefined &&
		(hostRows.length === 0 ||
			hostRows.some((host) => host.organizationId === organizationId));
	const liveRows = useMemo<KnownHostRow[]>(
		() =>
			(hostRows ?? [])
				.filter((host) => host.organizationId === organizationId)
				.map((host) => ({
					organizationId: host.organizationId,
					machineId: host.machineId,
					isOnline: host.isOnline,
				})),
		[hostRows, organizationId],
	);

	// The snapshot carries its owning org so a prior org's rows can never be
	// served across an org switch, even before the async reload lands.
	const [snapshot, setSnapshot] = useState<{
		organizationId: string;
		rows: KnownHostRow[];
	} | null>(null);
	useEffect(() => {
		if (!organizationId) return;
		let cancelled = false;
		void loadKnownHostsSnapshot(organizationId).then((rows) => {
			if (cancelled || !rows) return;
			setSnapshot({ organizationId, rows });
		});
		return () => {
			cancelled = true;
		};
	}, [organizationId]);

	// Persist only once the query has answered: a pre-response empty list must
	// not overwrite the snapshot, and an answered empty list must (so deleting
	// the org's last host doesn't leave a ghost on the next boot). The org is
	// part of the fingerprint so two orgs that both answer empty each get their
	// own write instead of the second being deduped away.
	const lastPersistedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!organizationId || !liveReady) return;
		const fingerprint = `${organizationId}:${JSON.stringify(liveRows)}`;
		if (lastPersistedRef.current === fingerprint) return;
		lastPersistedRef.current = fingerprint;
		saveKnownHostsSnapshot(organizationId, liveRows);
	}, [organizationId, liveReady, liveRows]);

	const hosts = useMemo(() => {
		const snapshotRows =
			snapshot && snapshot.organizationId === organizationId
				? snapshot.rows
				: undefined;
		return resolveKnownHosts(liveRows, snapshotRows, liveReady);
	}, [liveRows, liveReady, snapshot, organizationId]);

	const presence = useHostsPresence(hosts);
	const hostsWithPresence = useMemo(() => {
		if (!presence) return hosts;
		return hosts.map((host) => ({
			...host,
			isOnline: presence.get(host.machineId) ?? host.isOnline,
		}));
	}, [hosts, presence]);

	const settled =
		liveReady ||
		(snapshot !== null && snapshot.organizationId === organizationId);

	return { hosts: hostsWithPresence, organizationId, settled };
}
