import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Which project sections are shut, keyed `machineId:projectId` — collapse is
 * per host because the same project can hold different work on each machine.
 * Absent means expanded: a project you've never touched shows its workspaces
 * rather than hiding them behind a caret.
 */
interface CollapsedProjectsStore {
	collapsed: Record<string, true>;
	/** False until AsyncStorage answers — sections would flash open before it. */
	hasHydrated: boolean;
	toggleProject: (machineId: string, projectId: string) => void;
	setAllCollapsed: (
		machineId: string,
		projectIds: string[],
		collapsed: boolean,
	) => void;
}

export function collapsedProjectKey(machineId: string, projectId: string) {
	return `${machineId}:${projectId}`;
}

export const useCollapsedProjectsStore = create<CollapsedProjectsStore>()(
	persist(
		(set) => ({
			collapsed: {},
			hasHydrated: false,
			toggleProject: (machineId, projectId) => {
				set((state) => {
					const key = collapsedProjectKey(machineId, projectId);
					if (state.collapsed[key]) {
						const { [key]: _removed, ...collapsed } = state.collapsed;
						return { collapsed };
					}
					return { collapsed: { ...state.collapsed, [key]: true as const } };
				});
			},
			setAllCollapsed: (machineId, projectIds, collapsed) => {
				set((state) => {
					const next = { ...state.collapsed };
					for (const projectId of projectIds) {
						const key = collapsedProjectKey(machineId, projectId);
						if (collapsed) next[key] = true;
						else delete next[key];
					}
					return { collapsed: next };
				});
			},
		}),
		{
			name: "collapsed-projects-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ collapsed }) => ({ collapsed }),
			// Rehydration is async, so readers see {} first and every collapsed
			// section would render expanded and then snap shut. Flips on storage
			// errors too, so a failed read falls back to everything expanded.
			onRehydrateStorage: () => () =>
				useCollapsedProjectsStore.setState({ hasHydrated: true }),
		},
	),
);
