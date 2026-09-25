import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceSort = "updatedAt" | "createdAt";

/** Cloud is a place you scope to, not a machine you own. */
export type WorkspaceScope = "cloud" | "host";

export const SORT_OPTIONS: {
	value: WorkspaceSort;
	label: MessageDescriptor;
}[] = [
	{
		label: msg({ message: "Last updated" }),
		value: "updatedAt",
	},
	{
		label: msg({ message: "Date created" }),
		value: "createdAt",
	},
];

interface WorkspacesFilterStore {
	hostFilter: string | null;
	scope: WorkspaceScope;
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
			sort: "updatedAt",
			hasHydrated: false,
			// Picking a machine is also how you leave Cloud; the machine is
			// remembered either way so Cloud → machine returns you where you were.
			setHostFilter: (machineId) =>
				set({ hostFilter: machineId, scope: "host" }),
			setScopeCloud: () => set({ scope: "cloud" }),
			setSort: (sort) => set({ sort }),
		}),
		{
			name: "workspaces-filter",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ hostFilter, scope, sort }) => ({
				hostFilter,
				scope,
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
