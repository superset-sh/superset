import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	type DashboardSidebarPortGroup,
	useDashboardSidebarPortsData,
} from "../../components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortsData";

interface DashboardSidebarPortsContextValue {
	workspacePortGroups: DashboardSidebarPortGroup[];
	totalPortCount: number;
	groupsByWorkspaceId: Map<string, DashboardSidebarPortGroup>;
}

const DashboardSidebarPortsContext =
	createContext<DashboardSidebarPortsContextValue | null>(null);

export function DashboardSidebarPortsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { workspacePortGroups, totalPortCount } =
		useDashboardSidebarPortsData();

	const value = useMemo<DashboardSidebarPortsContextValue>(
		() => ({
			workspacePortGroups,
			totalPortCount,
			groupsByWorkspaceId: new Map(
				workspacePortGroups.map((group) => [group.workspaceId, group]),
			),
		}),
		[workspacePortGroups, totalPortCount],
	);

	return (
		<DashboardSidebarPortsContext.Provider value={value}>
			{children}
		</DashboardSidebarPortsContext.Provider>
	);
}

function useDashboardSidebarPortsContext(): DashboardSidebarPortsContextValue {
	const context = useContext(DashboardSidebarPortsContext);
	if (!context) {
		return {
			workspacePortGroups: [],
			totalPortCount: 0,
			groupsByWorkspaceId: new Map(),
		};
	}
	return context;
}

/** All port groups + total count, for the consolidated bottom panel. */
export function useDashboardSidebarAllPorts(): {
	workspacePortGroups: DashboardSidebarPortGroup[];
	totalPortCount: number;
} {
	const { workspacePortGroups, totalPortCount } =
		useDashboardSidebarPortsContext();
	return { workspacePortGroups, totalPortCount };
}

/** The port group for a single workspace, for the inline per-item row. */
export function useDashboardSidebarWorkspacePorts(
	workspaceId: string,
): DashboardSidebarPortGroup | null {
	const { groupsByWorkspaceId } = useDashboardSidebarPortsContext();
	return groupsByWorkspaceId.get(workspaceId) ?? null;
}
