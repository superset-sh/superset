import type { SelectV2Host } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

/**
 * The list view is always scoped to one host: the explicit filter pick if
 * that host still exists, else the first online host, else the first host.
 */
export function useSelectedHost(): SelectV2Host | null {
	const collections = useCollections();
	const hostFilter = useWorkspacesFilterStore((store) => store.hostFilter);

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	return useMemo(() => {
		const sorted = [...(hosts ?? [])].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return (
			sorted.find((host) => host.machineId === hostFilter) ??
			sorted.find((host) => host.isOnline) ??
			sorted[0] ??
			null
		);
	}, [hosts, hostFilter]);
}
