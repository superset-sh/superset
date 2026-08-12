import { useMemo } from "react";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { type OrgHost, useOrgHosts } from "@/hooks/useOrgHosts";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

/**
 * The list view is always scoped to one host: the explicit filter pick if
 * that host still exists, else the first online host, else the first host.
 */
export function useSelectedHost(): OrgHost | null {
	const hosts = useOrgHosts();
	const hostFilter = useWorkspacesFilterStore((store) => store.hostFilter);

	const presence = useHostsPresence(hosts);

	return useMemo(() => {
		const sorted = hosts
			.map((host) => ({
				...host,
				isOnline: presence?.get(host.machineId) ?? host.isOnline,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		return (
			sorted.find((host) => host.machineId === hostFilter) ??
			sorted.find((host) => host.isOnline) ??
			sorted[0] ??
			null
		);
	}, [hosts, hostFilter, presence]);
}
