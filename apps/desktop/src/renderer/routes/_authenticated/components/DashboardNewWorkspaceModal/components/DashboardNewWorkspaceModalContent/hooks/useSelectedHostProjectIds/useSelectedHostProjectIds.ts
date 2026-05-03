import { useHostTargetUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useHostProjectIds } from "renderer/react-query/projects";
import type { WorkspaceHostTarget } from "../../../DashboardNewWorkspaceForm/components/DevicePicker/types";

export function useSelectedHostProjectIds(
	hostTarget: WorkspaceHostTarget,
): Set<string> | null {
	return useHostProjectIds(useHostTargetUrl(hostTarget));
}
