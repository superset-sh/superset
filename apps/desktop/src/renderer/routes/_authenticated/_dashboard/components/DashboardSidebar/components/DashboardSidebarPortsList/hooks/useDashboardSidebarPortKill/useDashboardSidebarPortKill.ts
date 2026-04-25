import { usePortKillActions } from "renderer/hooks/ports/usePortKillActions";
import type { DashboardSidebarPort } from "../useDashboardSidebarPortsData";

const HOST_PORTS_QUERY_PREFIX = ["host-service", "ports", "getAll"] as const;

export function useDashboardSidebarPortKill() {
	return usePortKillActions<DashboardSidebarPort>({
		refreshQueryKey: HOST_PORTS_QUERY_PREFIX,
	});
}
