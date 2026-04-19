import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../../components/DevicePicker";

export interface UseHostProjectIdsResult {
	/** IDs of cloud projects that are set up on the selected host.
	 * Null while the query is loading or the host URL isn't available. */
	projectIds: Set<string> | null;
	isLoading: boolean;
	isError: boolean;
}

/**
 * Queries host-service `project.list` on the selected device and returns
 * the set of project IDs set up there. Used by the new-workspace picker
 * to split cloud projects into "Available" (set up here) vs "Needs setup"
 * groups — the user should explicitly pick where to clone before we let
 * them select a branch.
 */
export function useHostProjectIds(
	hostTarget: WorkspaceHostTarget,
): UseHostProjectIdsResult {
	const { activeHostUrl } = useLocalHostService();

	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	const { data, isLoading, isError } = useQuery({
		queryKey: ["project", "list", hostUrl],
		queryFn: async () => {
			if (!hostUrl) return [];
			const client = getHostServiceClientByUrl(hostUrl);
			return client.project.list.query();
		},
		enabled: !!hostUrl,
	});

	const projectIds = useMemo(
		() => (data ? new Set(data.map((p) => p.id)) : null),
		[data],
	);

	return { projectIds, isLoading, isError };
}
