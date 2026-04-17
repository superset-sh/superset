import { create } from "zustand";

export type V2WorkspacesDeviceFilter =
	| "all"
	| "this-device"
	| "other-devices"
	| "cloud";

interface V2WorkspacesFilterState {
	searchQuery: string;
	deviceFilter: V2WorkspacesDeviceFilter;
	setSearchQuery: (searchQuery: string) => void;
	setDeviceFilter: (deviceFilter: V2WorkspacesDeviceFilter) => void;
	reset: () => void;
}

export const useV2WorkspacesFilterStore = create<V2WorkspacesFilterState>()(
	(set) => ({
		searchQuery: "",
		deviceFilter: "all",
		setSearchQuery: (searchQuery) => set({ searchQuery }),
		setDeviceFilter: (deviceFilter) => set({ deviceFilter }),
		reset: () => set({ searchQuery: "", deviceFilter: "all" }),
	}),
);
