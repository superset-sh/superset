import { create } from "zustand";

interface PresetChordState {
	isChordActive: boolean;
}

interface PresetChordActions {
	setChordActive: (active: boolean) => void;
}

export const usePresetChordStore = create<
	PresetChordState & PresetChordActions
>((set) => ({
	isChordActive: false,
	setChordActive: (active) => set({ isChordActive: active }),
}));
