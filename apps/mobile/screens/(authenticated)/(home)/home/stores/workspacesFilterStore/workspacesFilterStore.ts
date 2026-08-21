import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceSort = "updatedAt" | "createdAt";

/** Cloud is a place you scope to, not a machine you own. */
export type WorkspaceScope = "cloud" | "host";

export const SORT_OPTIONS: { value: WorkspaceSort; label: string }[] = [
	{ label: "Last updated", value: "updatedAt" },
	{ label: "Date created", value: "createdAt" },
];

interface WorkspacesFilterStore {
	hostFilter: string | null;
	scope: WorkspaceScope;
	/**
	 * False until the scope was picked by hand. Until then the home screen may
	 * open on Cloud when the remembered machine is asleep; after it, the pick
	 * stands even when the machine goes offline — a scope that moves under you
	 * is worse than an empty list you chose.
	 */
	scopePicked: boolean;
	sort: WorkspaceSort;
	/** False until AsyncStorage has answered — the saved filter isn't here yet. */
	hasHydrated: boolean;
	setHostFilter: (machineId: string | null) => void;
	setScopeCloud: () => void;
	setSort: (sort: WorkspaceSort) => void;
}

export const useWorkspacesFilterStore = create<WorkspacesFilterStore>()(
	persist(
		(set) => ({
			hostFilter: null,
			scope: "host",
			scopePicked: false,
			sort: "updatedAt",
			hasHydrated: false,
			// Picking a machine is also how you leave Cloud; the machine is
			// remembered either way so Cloud → machine returns you where you were.
			setHostFilter: (machineId) =>
				set({ hostFilter: machineId, scope: "host", scopePicked: true }),
			setScopeCloud: () => set({ scope: "cloud", scopePicked: true }),
			setSort: (sort) => set({ sort }),
		}),
		{
			name: "workspaces-filter",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ hostFilter, scope, scopePicked, sort }) => ({
				hostFilter,
				scope,
				scopePicked,
				sort,
			}),
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
