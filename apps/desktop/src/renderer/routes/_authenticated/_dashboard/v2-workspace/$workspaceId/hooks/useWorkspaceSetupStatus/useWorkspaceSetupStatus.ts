import { useQuery } from "@tanstack/react-query";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
export function useWorkspaceSetupStatus(workspaceId: string, enabled = true) {
	const target = useWorkspaceHostTarget(workspaceId);
	const hostUrl = target.status === "ready" ? target.url : null;
	return useQuery({
		queryKey: ["workspace-setup-status", hostUrl, workspaceId],
		enabled: enabled && Boolean(hostUrl),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl ?? "").workspaceSetup.status.query({
				workspaceId,
			}),
		refetchInterval: (query) =>
			query.state.data &&
			query.state.data.status !== "ready" &&
			query.state.data.status !== "failed"
				? 1500
				: false,
		retry: false,
	});
}
