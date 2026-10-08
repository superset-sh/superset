import { create } from "zustand";
import type { AudioLevels } from "./transport/RealtimeTransport";

interface VoiceLevelsState extends AudioLevels {
	set: (levels: AudioLevels) => void;
}

/** Sampled every ~100ms while a session runs; its own store so only the orb re-renders. */
export const useVoiceLevelsStore = create<VoiceLevelsState>()((set) => ({
	input: 0,
	output: 0,
	set: (levels) => set(levels),
}));
