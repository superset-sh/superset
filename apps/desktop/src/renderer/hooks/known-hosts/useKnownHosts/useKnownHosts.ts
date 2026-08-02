import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";
import {
	type KnownHostRow,
	loadKnownHostsSnapshot,
	resolveKnownHosts,
	saveKnownHostsSnapshot,
} from "./useKnownHosts.utils";

export type { KnownHostRow } from "./useKnownHosts.utils";

/**
 * Org host list for query-target derivation, decoupled from Electric's sync
 * lifecycle. The Electric `v2Hosts` collection stays the live source, but its
 * rows are persisted to IndexedDB and served from that snapshot whenever the
 * collection is empty and not yet ready (cold start before hydration, resync
 * truncation). A ready-but-empty collection is authoritative: the snapshot
 * must not resurrect an org's deleted last host.
 *
 * Without this, an Electric flicker empties the host target list and every
 * host-derived read path (workspaces, projects, PR chips, ports) drops its
 * rows — a full sidebar clear (verified 2026-08-01; see
 * apps/desktop/docs/SIDEBAR_STATE_RESILIENCE.md).
 */
export function useKnownHosts(): {
	hosts: KnownHostRow[];
	organizationId: string | null;
} {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const organizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: liveRows = [], isReady: liveReady } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				isOnline: hosts.isOnline,
			})),
		[collections],
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

	// Persist only once the collection is ready: a partial pre-sync result
	// must not overwrite the snapshot, and a ready-but-empty list must (so
	// deleting the org's last host doesn't leave a ghost on the next boot).
	const lastPersistedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!organizationId || !liveReady) return;
		const fingerprint = JSON.stringify(liveRows);
		if (lastPersistedRef.current === fingerprint) return;
		lastPersistedRef.current = fingerprint;
		saveKnownHostsSnapshot(organizationId, liveRows as KnownHostRow[]);
	}, [organizationId, liveReady, liveRows]);

	const hosts = useMemo(() => {
		const snapshotRows =
			snapshot && snapshot.organizationId === organizationId
				? snapshot.rows
				: undefined;
		return resolveKnownHosts(
			liveRows as KnownHostRow[],
			snapshotRows,
			liveReady,
		);
	}, [liveRows, liveReady, snapshot, organizationId]);

	return { hosts, organizationId };
}
