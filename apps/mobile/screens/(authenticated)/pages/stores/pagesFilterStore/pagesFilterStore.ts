import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const PAGE_SCOPES = ["all", "team", "mine"] as const;
export type PageScope = (typeof PAGE_SCOPES)[number];

interface PagesFilterStore {
	scope: PageScope;
	hasHydrated: boolean;
	setScope: (scope: PageScope) => void;
}

export const usePagesFilterStore = create<PagesFilterStore>()(
	persist(
		(set) => ({
			scope: "all",
			hasHydrated: false,
			setScope: (scope) => set({ scope }),
		}),
		{
			name: "pages-filter",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ scope }) => ({ scope }),
			onRehydrateStorage: () => () =>
				usePagesFilterStore.setState({ hasHydrated: true }),
		},
	),
);

export function matchesScope(
	page: { visibility: string },
	scope: PageScope,
): boolean {
	switch (scope) {
		case "team":
			return page.visibility === "org";
		case "mine":
			return page.visibility === "just_me";
		default:
			return true;
	}
}
