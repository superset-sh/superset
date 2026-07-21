import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ViewedFilesStore {
	viewedByWorkspace: Record<string, string[]>;
	toggleViewed: (workspaceId: string, path: string) => void;
}

export const useViewedFilesStore = create<ViewedFilesStore>()(
	persist(
		(set) => ({
			viewedByWorkspace: {},
			toggleViewed: (workspaceId, path) =>
				set((state) => {
					const current = state.viewedByWorkspace[workspaceId] ?? [];
					const next = current.includes(path)
						? current.filter((entry) => entry !== path)
						: [...current, path];
					return {
						viewedByWorkspace: {
							...state.viewedByWorkspace,
							[workspaceId]: next,
						},
					};
				}),
		}),
		{
			name: "viewed-diff-files",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
