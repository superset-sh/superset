import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useHostProjectIds } from "renderer/react-query/projects";

export function useSelectedHostProjectIds(
	hostId: string | null,
): Set<string> | null {
	return useHostProjectIds(useHostUrl(hostId));
}
