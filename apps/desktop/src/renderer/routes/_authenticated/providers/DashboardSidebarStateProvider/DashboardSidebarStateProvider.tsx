import { createContext, type ReactNode, useContext } from "react";
import { useStableActions } from "renderer/hooks/useStableActions";
import { useDashboardSidebarStateSource } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState/useDashboardSidebarStateSource";

type DashboardSidebarState = ReturnType<typeof useDashboardSidebarStateSource>;

export const DashboardSidebarStateContext =
	createContext<DashboardSidebarState | null>(null);

/**
 * Runs the sidebar-state source once and shares it as an object whose
 * identity never changes. The source reads the workspace list, tag folders
 * and host projects only inside its actions, so a consumer needs none of
 * those subscriptions; handing the source out directly re-rendered every
 * sidebar row each time a workspace's tags changed.
 */
export function DashboardSidebarStateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const state = useStableActions(useDashboardSidebarStateSource());
	return (
		<DashboardSidebarStateContext.Provider value={state}>
			{children}
		</DashboardSidebarStateContext.Provider>
	);
}

export function useDashboardSidebarState(): DashboardSidebarState {
	const value = useContext(DashboardSidebarStateContext);
	if (!value) {
		throw new Error(
			"useDashboardSidebarState must be used within DashboardSidebarStateProvider",
		);
	}
	return value;
}
