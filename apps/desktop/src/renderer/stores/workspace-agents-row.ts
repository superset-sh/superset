import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: show running agents inline under each workspace in the sidebar.
 *
 * On by default. Single source of truth for the experiment — read it
 * everywhere via {@link useWorkspaceAgentsRowEnabled}.
 *
 * To conclude the experiment, pick an outcome and remove the other side:
 *   1. This store + `useWorkspaceAgentsRowEnabled`.
 *   2. The toggle UI in `ExperimentalSettings` and its `settings-search` entry
 *      (`EXPERIMENTAL_WORKSPACE_AGENTS`).
 *   3. The flag branch in `DashboardSidebarWorkspaceChips` (the agents chip)
 *      and the `enabled` it threads into
 *      `useDashboardSidebarWorkspaceRunningAgents`.
 */
interface WorkspaceAgentsRowState {
	// When true, running agents render inline under each workspace item.
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useWorkspaceAgentsRowStore = create<WorkspaceAgentsRowState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "workspace-agents-row" },
		),
		{ name: "WorkspaceAgentsRowStore" },
	),
);

/** Single read path for the workspace-agents-row experiment flag. */
export function useWorkspaceAgentsRowEnabled(): boolean {
	return useWorkspaceAgentsRowStore((state) => state.enabled);
}
