import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface TerminalCloseConfirmState {
	/** When true, closing a terminal with a running process no longer prompts. */
	suppressed: boolean;
	suppress: () => void;
	reset: () => void;
}

export const useTerminalCloseConfirmStore = create<TerminalCloseConfirmState>()(
	devtools(
		persist(
			(set) => ({
				suppressed: false,
				suppress: () => set({ suppressed: true }),
				reset: () => set({ suppressed: false }),
			}),
			{ name: "terminal-close-confirm-v1" },
		),
		{ name: "TerminalCloseConfirm" },
	),
);
