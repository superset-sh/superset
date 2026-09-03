import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Show each workspace's branch (or worktree) name in the sidebar, the way
 * the v1 sidebar did under the workspace title. On by default; the label
 * renders at the start of the workspace's chip strip, before the agents chip.
 *
 * Read it via {@link useWorkspaceBranchLabelEnabled}; the toggle lives in
 * Appearance settings (`WorkspaceBranchLabelSection`).
 */
interface WorkspaceBranchLabelState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useWorkspaceBranchLabelStore = create<WorkspaceBranchLabelState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "workspace-branch-label" },
		),
		{ name: "WorkspaceBranchLabelStore" },
	),
);

/** Single read path for the sidebar branch-label toggle. */
export function useWorkspaceBranchLabelEnabled(): boolean {
	return useWorkspaceBranchLabelStore((state) => state.enabled);
}
