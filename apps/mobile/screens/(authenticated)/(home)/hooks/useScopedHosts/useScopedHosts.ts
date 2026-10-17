import { useMemo } from "react";
import { type OrgHost, useOrgHosts } from "@/hooks/useOrgHosts";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";

/**
 * Cloud keeps the selected machine loaded: the composer addresses its
 * workspaces by id.
 */
export function useScopedHosts(): OrgHost[] {
	const scope = useWorkspaceScope();
	const selectedHost = useSelectedHost();
	const { hosts } = useOrgHosts();

	return useMemo(() => {
		if (scope === "allHosts") {
			return [...hosts].sort((a, b) => a.name.localeCompare(b.name));
		}
		return selectedHost ? [selectedHost] : [];
	}, [scope, hosts, selectedHost]);
}
