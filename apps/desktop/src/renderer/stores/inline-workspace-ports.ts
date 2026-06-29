import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

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
