import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
	type DashboardSidebarPortGroup,
	useDashboardSidebarPortsData,
} from "../../hooks/useDashboardSidebarPortsData";

interface DashboardSidebarPortsContextValue {
	workspacePortGroups: DashboardSidebarPortGroup[];
	totalPortCount: number;
	groupsByWorkspaceId: Map<string, DashboardSidebarPortGroup>;
}

const DashboardSidebarPortsContext =
	createContext<DashboardSidebarPortsContextValue | null>(null);

export function DashboardSidebarPortsProvider({
	enabled = true,
	children,
}: {
	// Port data drives per-host queries, polling, and `port:changed`
	// subscriptions. Skip all of it when nothing will render ports (e.g. the
	// collapsed sidebar) — the flag is forwarded into the data hook rather than
	// branching the rendered element type here. This provider now wraps the
	// whole dashboard body (not just the sidebar), so switching between a bare
	// fragment and this component on `enabled` changes would remount
	// everything below it — including the routed workspace content — on every
	// sidebar collapse/expand.
	enabled?: boolean;
	children: ReactNode;
}) {
	const { workspacePortGroups, totalPortCount } =
		useDashboardSidebarPortsData(enabled);

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

/** All port groups + total count, for the top-bar ports dropdown. */
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
