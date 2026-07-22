import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: inline workspace ports vs. bottom ports panel.
 *
 * This flag exists only to A/B the two port layouts. It is the single source of
 * truth for the experiment — read it everywhere via {@link useInlineWorkspacePortsEnabled}.
 *
 * To conclude the experiment, pick the winning layout and remove the other:
 *   1. This store + `useInlineWorkspacePortsEnabled`.
 *   2. The toggle UI in `ExperimentalSettings` and its `settings-search` entry
 *      (`EXPERIMENTAL_INLINE_WORKSPACE_PORTS`).
 *   3. The flag branch in `DashboardSidebar` (bottom `DashboardSidebarPortsList`).
 *   4. The flag branch in `DashboardSidebarWorkspaceChips` (the inline ports
 *      chip).
 *   5. The components belonging to the losing layout:
 *      - bottom: `DashboardSidebarPortsList` (keep its `hooks/` + `DashboardSidebarPortBadge`).
 *      - inline: `DashboardSidebarPortsChip` (under
 *        `DashboardSidebarWorkspaceChips`).
 *
 * Both layouts read port data from `DashboardSidebarPortsProvider`, which stays
 * regardless of the outcome.
 */
interface InlineWorkspacePortsState {
	// When true, ports render inline under each workspace item. When false, they
	// render in the consolidated panel at the bottom of the sidebar.
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useInlineWorkspacePortsStore = create<InlineWorkspacePortsState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "inline-workspace-ports" },
		),
		{ name: "InlineWorkspacePortsStore" },
	),
);

/** Single read path for the inline-ports experiment flag. */
export function useInlineWorkspacePortsEnabled(): boolean {
	return useInlineWorkspacePortsStore((state) => state.enabled);
}
