import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceSort = "updatedAt" | "createdAt";

export const SORT_OPTIONS: { value: WorkspaceSort; label: string }[] = [
	{ label: "Last updated", value: "updatedAt" },
	{ label: "Date created", value: "createdAt" },
];

interface WorkspacesFilterStore {
	hostFilter: string | null;
	sort: WorkspaceSort;
	/** False until AsyncStorage has answered — the saved filter isn't here yet. */
	hasHydrated: boolean;
	setHostFilter: (machineId: string | null) => void;
	setSort: (sort: WorkspaceSort) => void;
}

export const useWorkspacesFilterStore = create<WorkspacesFilterStore>()(
	persist(
		(set) => ({
			hostFilter: null,
			sort: "updatedAt",
			hasHydrated: false,
			setHostFilter: (machineId) => set({ hostFilter: machineId }),
			setSort: (sort) => set({ sort }),
		}),
		{
			name: "workspaces-filter",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ hostFilter, sort }) => ({ hostFilter, sort }),
			// Rehydration is async — measured at ~165ms on a cold start — so
			// readers see the defaults first and the home screen would spend that
			// window showing (and fetching) the wrong host's default project.
			// Consumers wait on this flag instead. It flips on storage errors too,
			// so a failed read falls back to the defaults rather than hanging.
			onRehydrateStorage: () => () =>
				useWorkspacesFilterStore.setState({ hasHydrated: true }),
		},
	),
);
