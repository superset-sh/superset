import { create } from "zustand";
import type { Command } from "./types";

export interface Frame {
	command: Command;
}

interface FrameStackState {
	open: boolean;
	frames: Frame[];
	setOpen: (open: boolean) => void;
	pushFrame: (command: Command) => void;
	popFrame: () => void;
	reset: () => void;
}

export const useFrameStackStore = create<FrameStackState>((set) => ({
	open: false,
	frames: [],
	setOpen: (open) => set(open ? { open: true } : { open: false, frames: [] }),
	pushFrame: (command) =>
		set((state) => ({ frames: [...state.frames, { command }] })),
	popFrame: () => set((state) => ({ frames: state.frames.slice(0, -1) })),
	reset: () => set({ frames: [] }),
}));
