import type * as MediaLibrary from "expo-media-library/legacy";
import { create } from "zustand";

interface AttachmentsSelectionStore {
	selected: MediaLibrary.Asset[];
	toggleAsset: (asset: MediaLibrary.Asset) => void;
	clear: () => void;
}

export const useAttachmentsSelectionStore = create<AttachmentsSelectionStore>()(
	(set) => ({
		selected: [],
		toggleAsset: (asset) =>
			set((state) => ({
				selected: state.selected.some((entry) => entry.id === asset.id)
					? state.selected.filter((entry) => entry.id !== asset.id)
					: [...state.selected, asset],
			})),
		clear: () => set({ selected: [] }),
	}),
);
