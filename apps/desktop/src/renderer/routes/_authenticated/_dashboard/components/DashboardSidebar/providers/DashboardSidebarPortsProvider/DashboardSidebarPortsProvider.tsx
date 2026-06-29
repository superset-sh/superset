import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	type DashboardSidebarPortGroup,
	useDashboardSidebarPortsData,
} from "../../components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortsData";

interface DashboardSidebarPortsContextValue {
	groupsByWorkspaceId: Map<string, DashboardSidebarPortGroup>;
}

const DashboardSidebarPortsContext =
	createContext<DashboardSidebarPortsContextValue | null>(null);

export function DashboardSidebarPortsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { workspacePortGroups } = useDashboardSidebarPortsData();

	const value = useMemo<DashboardSidebarPortsContextValue>(
		() => ({
			groupsByWorkspaceId: new Map(
				workspacePortGroups.map((group) => [group.workspaceId, group]),
			),
		}),
		[workspacePortGroups],
	);

	return (
		<DashboardSidebarPortsContext.Provider value={value}>
			{children}
		</DashboardSidebarPortsContext.Provider>
	);
}

export function useDashboardSidebarWorkspacePorts(
	workspaceId: string,
): DashboardSidebarPortGroup | null {
	const context = useContext(DashboardSidebarPortsContext);
	if (!context) return null;
	return context.groupsByWorkspaceId.get(workspaceId) ?? null;
}
