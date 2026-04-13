import { useQuery } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../components/DevicePicker";

/**
 * Fetches branch data for the create-workspace composer via the host-service.
 * Accepts a V2 project ID + host target directly.
 */
export function useBranchContext(
	projectId: string | null,
	hostTarget: WorkspaceHostTarget,
) {
	const { activeHostUrl } = useLocalHostService();
	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	return useQuery({
		queryKey: ["workspaceCreation", "searchBranches", projectId, hostUrl],
		queryFn: async () => {
			if (!hostUrl || !projectId) {
				return {
					defaultBranch: null as string | null,
					branches: [] as Array<{
						name: string;
						lastCommitDate: number;
						isLocal: boolean;
						hasWorkspace: boolean;
					}>,
				};
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchBranches.query({ projectId });
		},
		enabled: !!projectId && !!hostUrl,
	});
}
